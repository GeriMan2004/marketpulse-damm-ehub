"""Ensemble — blend brand-level model forecasts then allocate to SKU.

Why this design (vs. the previous SKU-direct ensemble):
  * The stable data grain in our actuals is brand × sub_channel × month
    (~82 series), not SKU × sub_channel × month (~471 series of which
    many are intermittent). Forecasting at the noisier grain inflates
    error variance. We now train + ensemble at brand-channel level, then
    allocate down to SKU using recent volume mix.
  * Ensemble weights are learned per sub_channel by STEP 5
    (model_selection.py) via rolling-origin WAPE. Hardcoded weights are
    the fallback only when model_selection.json is missing.
  * SKU forecasts sum back to the brand-channel forecast exactly because
    they are produced as `brand_forecast × share[sku]` with shares that
    sum to 1 within each brand × sub_channel.

The output schema (snapshots/forecast.parquet) is preserved so every
existing endpoint continues to read from the same columns:
  material_id, brand, sub_channel, sales_channel, date, horizon,
  Hl_hat_p10, Hl_hat_p50, Hl_hat_p90.
"""

from __future__ import annotations

import json
from datetime import date as date_t
from pathlib import Path

import joblib
import numpy as np
import polars as pl

from app.services.forecast import baselines as bl
from app.services.forecast.model_selection import (
    aggregate_brand_subch,
    build_brand_features,
    predict_brand_lgb,
    predict_chronos,
    predict_cmbc,
    predict_statsforecast,
)

ROOT = Path(__file__).resolve().parents[3]
WIDE = ROOT / "app" / "data" / "snapshots" / "wide_monthly.parquet"
ZEROSHOT = ROOT / "app" / "data" / "snapshots" / "forecasts_zeroshot.parquet"
AUTOARIMA = ROOT / "app" / "data" / "snapshots" / "forecasts_autoarima.parquet"
CMBC = ROOT / "app" / "data" / "snapshots" / "forecasts_cmbc.parquet"
SNAPSHOTS = ROOT / "app" / "data" / "snapshots"
MODELS = ROOT / "models"

HORIZON_MONTHS = 9
CMBC_CHANNEL = "FREE TRADE CMBC"
ALLOCATION_WINDOW = 3   # months of recent volume for SKU mix; falls back to 6, 12

# Default per-channel weights — used only if models/model_selection.json is
# missing. STEP 5 normally overrides these with WAPE-derived weights.
DEFAULT_WEIGHTS: dict[str, dict[str, float]] = {
    "GROCERY":                 {"brand_lgb": 0.40, "autoets": 0.30, "snaive": 0.20, "chronos": 0.10},
    "FREE TRADE CMBC":         {"cmbc": 1.00},
    "NATIONAL ON TRADE":       {"brand_lgb": 0.40, "autoarima": 0.30, "autoets": 0.20, "snaive": 0.10},
    "FREE TRADE":              {"brand_lgb": 0.40, "autoarima": 0.30, "autoets": 0.20, "snaive": 0.10},
    "CONVENIENCE & WHOLESALE": {"brand_lgb": 0.40, "autoarima": 0.30, "autoets": 0.20, "snaive": 0.10},
    "MDD COPACKING":           {"brand_lgb": 0.50, "snaive": 0.30, "ma6": 0.20},
}

# p10 / p90 spread for models that produce only point forecasts. Calibration
# (STEP 7) tightens this with conformal qhats — the value here just gives a
# sane interior PI before calibration.
POINT_PI_BAND = 0.30  # ±30 % of point forecast for p10/p90 around p50


# ──────────────────────────────────────────────────────────────────────────────
# Brand-level forecast generation
# ──────────────────────────────────────────────────────────────────────────────


def _next_months(last_date: date_t, horizon: int) -> list[date_t]:
    out = []
    y, m = last_date.year, last_date.month
    for _ in range(horizon):
        m += 1
        if m > 12:
            m = 1
            y += 1
        out.append(date_t(y, m, 1))
    return out


def _baselines_brand(agg: pl.DataFrame, eval_dates: list[date_t]) -> dict[str, dict[tuple[str, str], np.ndarray]]:
    """Compute naive / snaive / ma3 / ma6 forecasts at brand × sub_channel."""
    out: dict[str, dict[tuple[str, str], np.ndarray]] = {m: {} for m in bl.BASELINES}
    horizon = len(eval_dates)
    for (brand, sub), grp in agg.group_by(["brand", "sub_channel"], maintain_order=True):
        h = grp.sort("date")["Hl"].to_numpy()
        for name, fn in bl.BASELINES.items():
            out[name][(brand, sub)] = fn(h, horizon)
    return out


def _aggregate_zeroshot_to_brand(
    monthly: pl.DataFrame, eval_dates: list[date_t],
) -> dict[tuple[str, str], dict[str, np.ndarray]]:
    """Sum SKU-level Chronos zero-shot forecasts up to brand × sub_channel.

    Returns dict (brand, sub_channel) → {p10, p50, p90} arrays of length H.
    Used as one of the brand-level model signals in the ensemble.
    """
    if not ZEROSHOT.is_file():
        return {}
    z = pl.read_parquet(ZEROSHOT).with_columns(pl.col("date").cast(pl.Date))
    sku_to_brand = monthly.select(["material_id", "brand"]).unique()
    z = z.join(sku_to_brand, on="material_id", how="left").drop_nulls("brand")
    agg = (
        z.group_by(["brand", "sub_channel", "date"])
        .agg(
            pl.col("chronos_p10").sum(),
            pl.col("chronos_p50").sum(),
            pl.col("chronos_p90").sum(),
        )
        .sort(["brand", "sub_channel", "date"])
    )
    out: dict[tuple[str, str], dict[str, np.ndarray]] = {}
    for (brand, sub), grp in agg.group_by(["brand", "sub_channel"], maintain_order=True):
        ordered = grp.sort("date")
        # Build aligned arrays for the eval window
        date_to_idx = {d: i for i, d in enumerate(eval_dates)}
        p10 = np.zeros(len(eval_dates))
        p50 = np.zeros(len(eval_dates))
        p90 = np.zeros(len(eval_dates))
        for r in ordered.iter_rows(named=True):
            i = date_to_idx.get(r["date"])
            if i is None:
                continue
            p10[i] = float(r["chronos_p10"] or 0.0)
            p50[i] = float(r["chronos_p50"] or 0.0)
            p90[i] = float(r["chronos_p90"] or 0.0)
        out[(brand, sub)] = {"p10": p10, "p50": p50, "p90": p90}
    return out


def _aggregate_cmbc_to_brand(eval_dates: list[date_t]) -> dict[tuple[str, str], np.ndarray]:
    """Sum SKU-level CMBC forecasts to brand × sub_channel (CMBC channel only)."""
    if not CMBC.is_file():
        return {}
    monthly = pl.read_parquet(WIDE)
    cmbc = pl.read_parquet(CMBC).with_columns(pl.col("date").cast(pl.Date))
    sku_to_brand = monthly.select(["material_id", "brand"]).unique()
    cmbc = cmbc.join(sku_to_brand, on="material_id", how="left").drop_nulls("brand")
    agg = (
        cmbc.group_by(["brand", "sub_channel", "date"])
        .agg(pl.col("Hl_hat_cmbc").sum())
        .sort(["brand", "sub_channel", "date"])
    )
    out: dict[tuple[str, str], np.ndarray] = {}
    for (brand, sub), grp in agg.group_by(["brand", "sub_channel"], maintain_order=True):
        date_to_idx = {d: i for i, d in enumerate(eval_dates)}
        arr = np.zeros(len(eval_dates))
        for r in grp.sort("date").iter_rows(named=True):
            i = date_to_idx.get(r["date"])
            if i is not None:
                arr[i] = float(r["Hl_hat_cmbc"] or 0.0)
        out[(brand, sub)] = arr
    return out


def _aggregate_autoarima_to_brand(
    eval_dates: list[date_t],
) -> dict[tuple[str, str], dict[str, np.ndarray]]:
    """Pick up the brand-level AutoARIMA forecast already produced in STEP 2."""
    if not AUTOARIMA.is_file():
        return {}
    aa = pl.read_parquet(AUTOARIMA).with_columns(pl.col("date").cast(pl.Date))
    out: dict[tuple[str, str], dict[str, np.ndarray]] = {}
    for (brand, sub), grp in aa.group_by(["brand", "sub_channel"], maintain_order=True):
        date_to_idx = {d: i for i, d in enumerate(eval_dates)}
        p50 = np.zeros(len(eval_dates))
        p10 = np.zeros(len(eval_dates))
        p90 = np.zeros(len(eval_dates))
        for r in grp.sort("date").iter_rows(named=True):
            i = date_to_idx.get(r["date"])
            if i is None:
                continue
            p50[i] = float(r["Hl_hat_autoarima"] or 0.0)
            p10[i] = float(r.get("lo80_autoarima") or p50[i] * (1 - POINT_PI_BAND))
            p90[i] = float(r.get("hi80_autoarima") or p50[i] * (1 + POINT_PI_BAND))
        out[(brand, sub)] = {"p10": p10, "p50": p50, "p90": p90}
    return out


# ──────────────────────────────────────────────────────────────────────────────
# Quantile expansion + blending
# ──────────────────────────────────────────────────────────────────────────────


def _to_quantile_dict(point: np.ndarray) -> dict[str, np.ndarray]:
    """Wrap a point forecast into a {p10, p50, p90} dict using ±POINT_PI_BAND."""
    p50 = np.maximum(point, 0.0)
    p10 = np.maximum(p50 * (1 - POINT_PI_BAND), 0.0)
    p90 = p50 * (1 + POINT_PI_BAND)
    return {"p10": p10, "p50": p50, "p90": p90}


def _blend_brand_channel(
    weights: dict[str, dict[str, float]],
    brand_preds: dict[str, dict[tuple[str, str], dict[str, np.ndarray]]],
    eval_dates: list[date_t],
) -> dict[tuple[str, str], dict[str, np.ndarray]]:
    """Blend per-(brand, sub_channel) using sub_channel-keyed weights.

    `brand_preds[model][(brand, sub)] = {p10, p50, p90}`. Returns a single
    blended dict keyed by (brand, sub) → {p10, p50, p90}.
    """
    # Collect every (brand, sub) any model produced a forecast for
    keys = set()
    for preds in brand_preds.values():
        keys.update(preds.keys())

    blended: dict[tuple[str, str], dict[str, np.ndarray]] = {}
    horizon = len(eval_dates)
    for key in sorted(keys):
        brand, sub = key
        w_map = weights.get(sub) or DEFAULT_WEIGHTS.get(sub, {"naive": 1.0})
        # Gather predictions only for models with weight > 0 and a forecast for this key
        contribs: dict[str, tuple[float, dict[str, np.ndarray]]] = {}
        for model, w in w_map.items():
            if w <= 0:
                continue
            preds = brand_preds.get(model, {}).get(key)
            if preds is None:
                continue
            contribs[model] = (float(w), preds)
        if not contribs:
            # Fallback: pick any available model for this key
            for model, preds_d in brand_preds.items():
                if key in preds_d:
                    contribs[model] = (1.0, preds_d[key])
                    break
        if not contribs:
            blended[key] = {"p10": np.zeros(horizon), "p50": np.zeros(horizon), "p90": np.zeros(horizon)}
            continue
        total_w = sum(w for w, _ in contribs.values())
        out = {q: np.zeros(horizon) for q in ("p10", "p50", "p90")}
        for w, preds in contribs.values():
            for q in ("p10", "p50", "p90"):
                out[q] += (w / total_w) * preds[q]
        # Enforce monotonicity p10 ≤ p50 ≤ p90 elementwise
        out["p10"] = np.minimum(out["p10"], out["p50"])
        out["p90"] = np.maximum(out["p90"], out["p50"])
        out["p10"] = np.maximum(out["p10"], 0.0)
        out["p50"] = np.maximum(out["p50"], 0.0)
        out["p90"] = np.maximum(out["p90"], 0.0)
        blended[key] = out
    return blended


# ──────────────────────────────────────────────────────────────────────────────
# Brand → SKU allocation
# ──────────────────────────────────────────────────────────────────────────────


def _sku_volume_share(
    monthly: pl.DataFrame, last_date: date_t,
) -> dict[tuple[str, str], dict[str, float]]:
    """Recent-volume SKU share inside each (brand, sub_channel).

    Tries successively wider trailing windows (3, 6, 12 months). Within each
    (brand, sub_channel), share[sku] = sum(Hl) / total. If every window has
    zero volume (very rare), falls back to the most recent non-zero month;
    if even that is missing, falls back to equal split across SKUs.

    Shares always sum to 1.0 per (brand, sub_channel).
    """
    keys_all = monthly.select(["material_id", "brand", "sub_channel"]).unique()
    shares: dict[tuple[str, str], dict[str, float]] = {}
    windows = (ALLOCATION_WINDOW, 6, 12, 24)
    for w_months in windows:
        cutoff_y = last_date.year
        cutoff_m = last_date.month - w_months + 1
        while cutoff_m < 1:
            cutoff_m += 12
            cutoff_y -= 1
        cutoff_d = date_t(cutoff_y, cutoff_m, 1)
        recent = monthly.filter(pl.col("date") >= cutoff_d)
        if len(recent) == 0:
            continue
        agg = (
            recent.group_by(["brand", "sub_channel", "material_id"])
            .agg(pl.col("Hl").sum().alias("vol"))
        )
        for (brand, sub), grp in agg.group_by(["brand", "sub_channel"], maintain_order=True):
            if (brand, sub) in shares:
                continue
            total = float(grp["vol"].sum())
            if total <= 0:
                continue
            shares[(brand, sub)] = {
                r["material_id"]: float(r["vol"]) / total
                for r in grp.iter_rows(named=True)
            }
        if len(shares) >= keys_all.group_by(["brand", "sub_channel"]).len().height:
            break

    # Equal-split fallback for any (brand, sub_channel) with no recent volume
    by_pair = (
        keys_all.group_by(["brand", "sub_channel"])
        .agg(pl.col("material_id"))
    )
    for r in by_pair.iter_rows(named=True):
        key = (r["brand"], r["sub_channel"])
        if key in shares:
            continue
        skus = r["material_id"]
        if not skus:
            continue
        equal = 1.0 / len(skus)
        shares[key] = {s: equal for s in skus}

    return shares


def _allocate_to_sku(
    blended: dict[tuple[str, str], dict[str, np.ndarray]],
    shares: dict[tuple[str, str], dict[str, float]],
    eval_dates: list[date_t],
    monthly: pl.DataFrame,
) -> pl.DataFrame:
    """Multiply each (brand, sub_channel) forecast by SKU shares and emit
    one row per (material_id, sub_channel, date)."""
    sku_meta = monthly.select(["material_id", "brand", "sub_channel"]).unique()
    rows: list[dict] = []
    for r in sku_meta.iter_rows(named=True):
        brand = r["brand"]
        sub = r["sub_channel"]
        sku = r["material_id"]
        key = (brand, sub)
        if key not in blended:
            continue
        share_map = shares.get(key, {})
        share = float(share_map.get(sku, 0.0))
        if share <= 0:
            continue
        forecast = blended[key]
        for h, d in enumerate(eval_dates):
            rows.append({
                "material_id": sku,
                "brand": brand,
                "sub_channel": sub,
                "date": d,
                "horizon": h + 1,
                "Hl_hat_p10": float(max(0.0, forecast["p10"][h] * share)),
                "Hl_hat_p50": float(max(0.0, forecast["p50"][h] * share)),
                "Hl_hat_p90": float(max(0.0, forecast["p90"][h] * share)),
            })
    return pl.DataFrame(rows)


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────


def _load_weights() -> tuple[dict[str, dict[str, float]], str]:
    selection_path = MODELS / "model_selection.json"
    if selection_path.is_file():
        try:
            data = json.loads(selection_path.read_text())
            return data.get("weights", DEFAULT_WEIGHTS), "model_selection.json"
        except Exception as e:
            print(f"  ! could not read model_selection.json: {e} — falling back to defaults")
    return DEFAULT_WEIGHTS, "DEFAULT_WEIGHTS"


def main() -> int:
    print("=" * 72)
    print("STEP 6 — Ensemble (brand-level blend → SKU allocation)")
    print("=" * 72)

    if not WIDE.is_file():
        print("\n  wide_monthly.parquet not found. Run `make data`.")
        return 2

    monthly = pl.read_parquet(WIDE)
    agg = aggregate_brand_subch(monthly)
    df, numeric, categorical = build_brand_features(agg)

    last_date = monthly["date"].max()
    eval_dates = _next_months(last_date, HORIZON_MONTHS)
    print(f"\n[1/6] horizon: {eval_dates[0]} → {eval_dates[-1]}  ({HORIZON_MONTHS} months)")

    weights, weight_source = _load_weights()
    print(f"      weights source: {weight_source}")

    # ── Build brand-level forecasts from each model family
    print(f"\n[2/6] generating brand × sub_channel forecasts")
    brand_preds: dict[str, dict[tuple[str, str], dict[str, np.ndarray]]] = {}

    # Baselines (point forecasts)
    print("      · naive / snaive / ma3 / ma6")
    base_pred = _baselines_brand(agg, eval_dates)
    for name, m in base_pred.items():
        brand_preds[name] = {k: _to_quantile_dict(v) for k, v in m.items()}

    # Brand LGB (refit on full history for production forecast)
    print("      · brand_lgb (refit on full history)")
    try:
        lgb_point = predict_brand_lgb(df, df, eval_dates, numeric, categorical)
    except Exception as e:
        print(f"        ! brand_lgb failed: {e} — skipping")
        lgb_point = {}
    brand_preds["brand_lgb"] = {k: _to_quantile_dict(v) for k, v in lgb_point.items()}

    # AutoARIMA / AutoETS (use existing forecast file when available; fallback to refit)
    print("      · autoarima  (from STEP 2 if present)")
    aa_existing = _aggregate_autoarima_to_brand(eval_dates)
    if aa_existing:
        brand_preds["autoarima"] = aa_existing
    else:
        try:
            point = predict_statsforecast(agg, eval_dates, "autoarima")
            brand_preds["autoarima"] = {k: _to_quantile_dict(v) for k, v in point.items()}
        except Exception as e:
            print(f"        ! autoarima fallback failed: {e}")
            brand_preds["autoarima"] = {}

    print("      · autoets   (refit on full history)")
    try:
        ets_point = predict_statsforecast(agg, eval_dates, "autoets")
    except Exception as e:
        print(f"        ! autoets failed: {e}")
        ets_point = {}
    brand_preds["autoets"] = {k: _to_quantile_dict(v) for k, v in ets_point.items()}

    # Chronos (aggregated SKU-level zero-shot to brand)
    print("      · chronos    (aggregated from STEP 3)")
    chronos_brand = _aggregate_zeroshot_to_brand(monthly, eval_dates)
    brand_preds["chronos"] = chronos_brand

    # CMBC (aggregated CMBC SKU forecasts to brand × FREE TRADE CMBC)
    print("      · cmbc       (aggregated from STEP 4)")
    cmbc_brand = _aggregate_cmbc_to_brand(eval_dates)
    brand_preds["cmbc"] = {k: _to_quantile_dict(v) for k, v in cmbc_brand.items()}

    # Stats per model
    for m_name in ("naive", "snaive", "ma3", "ma6", "brand_lgb",
                   "autoarima", "autoets", "chronos", "cmbc"):
        n = len(brand_preds.get(m_name, {}))
        print(f"        {m_name:<12} {n} brand×sub_channel forecasts")

    # ── Blend per sub_channel using learned weights
    print(f"\n[3/6] blending with learned per-sub_channel weights")
    blended = _blend_brand_channel(weights, brand_preds, eval_dates)
    print(f"      blended {len(blended)} brand×sub_channel forecasts")

    # ── Allocate to SKU using recent volume share
    print(f"\n[4/6] computing SKU shares (window={ALLOCATION_WINDOW}m, fallback 6/12/24m, then equal)")
    shares = _sku_volume_share(monthly, last_date)
    print(f"      shares for {len(shares)} (brand, sub_channel) pairs")

    sku_forecast = _allocate_to_sku(blended, shares, eval_dates, monthly)
    print(f"      emitted {len(sku_forecast):,} SKU rows")

    # ── Invariant check: SKU sums match brand-channel forecasts
    print(f"\n[5/6] invariant: SKU sums == brand×sub_channel blend (within tolerance)")
    sku_summed = (
        sku_forecast.group_by(["brand", "sub_channel", "date"])
        .agg(
            pl.col("Hl_hat_p10").sum(),
            pl.col("Hl_hat_p50").sum(),
            pl.col("Hl_hat_p90").sum(),
        )
    )
    brand_check_rows = []
    for (brand, sub), q in blended.items():
        for h, d in enumerate(eval_dates):
            brand_check_rows.append({
                "brand": brand, "sub_channel": sub, "date": d,
                "expect_p10": float(q["p10"][h]),
                "expect_p50": float(q["p50"][h]),
                "expect_p90": float(q["p90"][h]),
            })
    expected = pl.DataFrame(brand_check_rows)
    diff = sku_summed.join(expected, on=["brand", "sub_channel", "date"], how="inner").with_columns(
        d50=(pl.col("Hl_hat_p50") - pl.col("expect_p50")).abs(),
    )
    max_diff = float(diff["d50"].max() or 0.0)
    print(f"      max |sku.sum - brand_blend|_p50 = {max_diff:.6f} Hl   "
          f"(tolerance 0.001 ⇒ {'✓' if max_diff < 0.001 else '!! tightening expected after renorm !!'})")

    # If diff exceeds tolerance (e.g. when an SKU has 0 share and was
    # dropped by allocator), renormalize SKUs in those (brand, sub_channel)
    # groups so they sum exactly to the brand blend.
    if max_diff >= 0.001:
        keys_to_fix = (
            diff.filter(pl.col("d50") >= 0.001)
            .select(["brand", "sub_channel", "date"]).unique()
        )
        for r in keys_to_fix.iter_rows(named=True):
            brand, sub, d = r["brand"], r["sub_channel"], r["date"]
            mask = (
                (sku_forecast["brand"] == brand)
                & (sku_forecast["sub_channel"] == sub)
                & (sku_forecast["date"] == d)
            )
            cur_sum = float(sku_forecast.filter(mask)["Hl_hat_p50"].sum())
            target = blended[(brand, sub)]["p50"][eval_dates.index(d)]
            if cur_sum <= 0:
                continue
            scale = target / cur_sum
            sku_forecast = sku_forecast.with_columns(
                pl.when(mask)
                .then(pl.col("Hl_hat_p10") * scale)
                .otherwise(pl.col("Hl_hat_p10")).alias("Hl_hat_p10"),
                pl.when(mask)
                .then(pl.col("Hl_hat_p50") * scale)
                .otherwise(pl.col("Hl_hat_p50")).alias("Hl_hat_p50"),
                pl.when(mask)
                .then(pl.col("Hl_hat_p90") * scale)
                .otherwise(pl.col("Hl_hat_p90")).alias("Hl_hat_p90"),
            )
        print(f"      renormalized affected groups so SKU sums match blend exactly")

    # Sanity: no nulls / negatives / non-finite
    for col in ("Hl_hat_p10", "Hl_hat_p50", "Hl_hat_p90"):
        n_null = int(sku_forecast[col].null_count())
        n_neg = int((sku_forecast[col] < 0).sum())
        n_nan = int((~sku_forecast[col].is_finite()).sum())
        assert n_null == 0, f"{col}: {n_null} null forecasts"
        assert n_neg == 0, f"{col}: {n_neg} negative forecasts"
        assert n_nan == 0, f"{col}: {n_nan} non-finite forecasts"

    # Attach sales_channel for downstream readers (matches old schema)
    sub_to_sales = monthly.select(["sub_channel", "sales_channel"]).unique()
    sku_forecast = sku_forecast.join(sub_to_sales, on="sub_channel", how="left")

    # ── Persist
    print(f"\n[6/6] persisting forecast.parquet + weights.json")
    sku_forecast = sku_forecast.with_columns(pl.col("date").cast(pl.Date))
    sku_forecast.write_parquet(SNAPSHOTS / "forecast.parquet")
    (MODELS / "weights.json").write_text(json.dumps(weights, indent=2))
    print(f"      snapshots/forecast.parquet  ({len(sku_forecast):,} rows)")
    print(f"      models/weights.json")

    # Quick summary by channel
    by_ch = sku_forecast.group_by("sub_channel").agg(
        n=pl.len(),
        total_hl=pl.col("Hl_hat_p50").sum(),
        mean_p50=pl.col("Hl_hat_p50").mean(),
    )
    print(f"\n      forecast totals by sub_channel:")
    for r in by_ch.iter_rows(named=True):
        print(f"        {r['sub_channel']:<28} n={r['n']:>4}  "
              f"total={r['total_hl']:>10,.0f} Hl  mean={r['mean_p50']:>7.1f}")

    print("\nSTEP 6 done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
