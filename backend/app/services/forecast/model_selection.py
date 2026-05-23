"""Model selection — rolling-origin validation at brand × sub_channel grain.

Why this exists: the previous pipeline trained at SKU × sub_channel × month
(471 series), but only 82 brand × sub_channel series have stable history
worth modelling. Forecasting at the noisier SKU level was inflating both
training error and ensemble variance. This module:

  1. Aggregates history to brand × sub_channel × month
  2. Runs N_FOLDS rolling-origin folds (walk-forward, H-month horizon)
  3. Generates predictions per fold from every candidate model family:
       - naive, snaive, ma3, ma6 (baselines — must beat these to be useful)
       - brand_lgb        (LightGBM refit on aggregated data)
       - autoarima        (per-series classical model)
       - autoets          (state-space exponential smoothing)
       - chronos          (zero-shot foundation model on aggregated series)
       - cmbc             (specialist model — only FREE TRADE CMBC channel)
  4. Computes WAPE / MAE_Hl / bias_Hl / sMAPE per (sub_channel, model)
  5. Derives per-sub_channel ensemble weights via inverse-WAPE rule

Outputs (consumed by STEP 5 ensemble.py):
  - snapshots/model_metrics.parquet
  - snapshots/model_cv_predictions.parquet
  - models/model_selection.json   (per-sub_channel model weights)

Run with:  cd backend && uv run python -m app.services.forecast.model_selection
"""

from __future__ import annotations

import json
import warnings
from dataclasses import dataclass
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
import polars as pl
from category_encoders import TargetEncoder

from app.services.forecast import baselines as bl
from app.services.forecast.metrics import (
    bias as m_bias,
    mae as m_mae,
    smape as m_smape,
    wape as m_wape,
)

warnings.filterwarnings("ignore", message="X does not have valid feature names")
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

ROOT = Path(__file__).resolve().parents[3]
WIDE = ROOT / "app" / "data" / "snapshots" / "wide_monthly.parquet"
SNAPSHOTS = ROOT / "app" / "data" / "snapshots"
MODELS = ROOT / "models"
MODELS.mkdir(parents=True, exist_ok=True)

N_FOLDS = 3
HORIZON = 3
CMBC_CHANNEL = "FREE TRADE CMBC"

# Models to evaluate. Key = canonical name used in metrics + weights.
ALL_MODELS = ["naive", "snaive", "ma3", "ma6", "brand_lgb", "autoarima", "autoets", "chronos", "cmbc"]
BASELINE_MODELS = ["naive", "snaive", "ma3", "ma6"]


# ──────────────────────────────────────────────────────────────────────────────
# Brand × sub_channel aggregation + features
# ──────────────────────────────────────────────────────────────────────────────


def aggregate_brand_subch(monthly: pl.DataFrame) -> pl.DataFrame:
    """Sum SKU-level Hl up to brand × sub_channel × month and forward the
    month-level external covariates (they're identical across SKUs)."""
    ext_cols = [
        c for c in (
            "temp_c_mean", "temp_c_anomaly",
            "trends_estrella", "trends_lager", "trends_beer",
            "ons_retail_index", "ons_food_drink_index",
            "uk_holidays_count",
        ) if c in monthly.columns
    ]
    sub_to_sales = monthly.select(["sub_channel", "sales_channel"]).unique()
    agg = (
        monthly
        .group_by(["brand", "sub_channel", "date"])
        .agg(
            pl.col("Hl").sum(),
            *[pl.col(c).mean().alias(c) for c in ext_cols],
        )
        .with_columns(
            month=pl.col("date").dt.month(),
            quarter=pl.col("date").dt.quarter(),
            year=pl.col("date").dt.year(),
        )
        .join(sub_to_sales, on="sub_channel", how="left")
        .sort(["brand", "sub_channel", "date"])
    )
    return agg


def build_brand_features(agg: pl.DataFrame) -> tuple[pl.DataFrame, list[str], list[str]]:
    """Lags + rolling means + Fourier seasonality at brand × sub_channel level."""
    keys = ["brand", "sub_channel"]
    df = agg.sort(keys + ["date"])
    lag_cols, roll_cols = [], []
    for lag in (1, 3, 6, 12):
        col = f"lag_{lag}"
        df = df.with_columns(pl.col("Hl").shift(lag).over(keys).alias(col))
        lag_cols.append(col)
    for w in (3, 6, 12):
        col = f"roll_mean_{w}"
        df = df.with_columns(
            pl.col("Hl").shift(1).rolling_mean(window_size=w, min_samples=1)
              .over(keys).alias(col),
        )
        roll_cols.append(col)
    df = df.with_columns(
        (2 * np.pi * pl.col("month") / 12).sin().alias("month_sin"),
        (2 * np.pi * pl.col("month") / 12).cos().alias("month_cos"),
        (pl.col("month") == 12).cast(pl.Int8).alias("is_christmas_month"),
        (pl.col("month").is_in([6, 7, 8])).cast(pl.Int8).alias("is_summer"),
        (pl.col("month").is_in([10, 11])).cast(pl.Int8).alias("is_christmas_buildup"),
    )
    cal_cols = [
        "month", "quarter", "year",
        "month_sin", "month_cos",
        "is_christmas_month", "is_summer", "is_christmas_buildup",
    ]
    ext_cols = [
        c for c in (
            "temp_c_mean", "temp_c_anomaly",
            "trends_estrella", "trends_lager", "trends_beer",
            "ons_retail_index", "ons_food_drink_index",
            "uk_holidays_count",
        ) if c in df.columns
    ]
    numeric = lag_cols + roll_cols + cal_cols + ext_cols
    categorical = ["brand", "sub_channel", "sales_channel"]
    return df, numeric, categorical


# ──────────────────────────────────────────────────────────────────────────────
# Per-fold model fitters
# ──────────────────────────────────────────────────────────────────────────────


def predict_baselines(
    history: pl.DataFrame, eval_dates: list,
) -> dict[str, dict[tuple[str, str], np.ndarray]]:
    """Compute every baseline forecast per (brand, sub_channel)."""
    out: dict[str, dict[tuple[str, str], np.ndarray]] = {m: {} for m in BASELINE_MODELS}
    horizon = len(eval_dates)
    for (brand, sub), grp in history.group_by(["brand", "sub_channel"], maintain_order=True):
        h = grp.sort("date")["Hl"].to_numpy()
        for name, fn in bl.BASELINES.items():
            out[name][(brand, sub)] = fn(h, horizon)
    return out


def _iterative_lgb_forecast(
    fitted_p50: lgb.LGBMRegressor,
    last_rows: pl.DataFrame,
    eval_dates: list,
    feature_cols: list[str],
    history_lookup: dict[tuple[str, str], list[float]],
) -> dict[tuple[str, str], np.ndarray]:
    """Iteratively forecast HORIZON months using last_rows as the seed.

    Updates the rolling history with the predicted p50 between iterations
    so lag features are coherent across the horizon.
    """
    preds: dict[tuple[str, str], np.ndarray] = {}
    for row in last_rows.iter_rows(named=True):
        brand = row["brand"]
        sub = row["sub_channel"]
        rolling = list(history_lookup.get((brand, sub), []))
        out = np.zeros(len(eval_dates), dtype=np.float64)
        for h, future_date in enumerate(eval_dates):
            feat_row = []
            for col in feature_cols:
                if col == "lag_1":
                    feat_row.append(rolling[-1] if rolling else 0.0)
                elif col == "lag_3":
                    feat_row.append(rolling[-3] if len(rolling) >= 3 else (rolling[-1] if rolling else 0.0))
                elif col == "lag_6":
                    feat_row.append(rolling[-6] if len(rolling) >= 6 else (rolling[-1] if rolling else 0.0))
                elif col == "lag_12":
                    feat_row.append(rolling[-12] if len(rolling) >= 12 else (rolling[-1] if rolling else 0.0))
                elif col == "roll_mean_3":
                    feat_row.append(float(np.mean(rolling[-3:])) if rolling else 0.0)
                elif col == "roll_mean_6":
                    feat_row.append(float(np.mean(rolling[-6:])) if rolling else 0.0)
                elif col == "roll_mean_12":
                    feat_row.append(float(np.mean(rolling[-12:])) if rolling else 0.0)
                elif col == "month":
                    feat_row.append(future_date.month)
                elif col == "quarter":
                    feat_row.append((future_date.month - 1) // 3 + 1)
                elif col == "year":
                    feat_row.append(future_date.year)
                elif col == "month_sin":
                    feat_row.append(float(np.sin(2 * np.pi * future_date.month / 12)))
                elif col == "month_cos":
                    feat_row.append(float(np.cos(2 * np.pi * future_date.month / 12)))
                elif col == "is_christmas_month":
                    feat_row.append(1 if future_date.month == 12 else 0)
                elif col == "is_summer":
                    feat_row.append(1 if future_date.month in (6, 7, 8) else 0)
                elif col == "is_christmas_buildup":
                    feat_row.append(1 if future_date.month in (10, 11) else 0)
                else:
                    # External / target-encoded feature — copy from last row
                    feat_row.append(float(row.get(col, 0.0) or 0.0))
            X = np.array([feat_row], dtype=float)
            yhat = float(fitted_p50.predict(X, num_iteration=fitted_p50.best_iteration_)[0])
            yhat = max(0.0, yhat)
            out[h] = yhat
            rolling.append(yhat)
        preds[(brand, sub)] = out
    return preds


def predict_brand_lgb(
    train_df: pl.DataFrame, full_df: pl.DataFrame, eval_dates: list,
    numeric: list[str], categorical: list[str],
) -> dict[tuple[str, str], np.ndarray]:
    """Fit a brand-level LightGBM on `train_df` and forecast eval_dates.

    Returns dict keyed by (brand, sub_channel) → np.array of length HORIZON.
    """
    train_clean = train_df.drop_nulls(subset=numeric + ["Hl"])
    if len(train_clean) < 50:
        return {}

    te = TargetEncoder(cols=categorical, smoothing=10.0)
    te.fit(train_clean.select(categorical).to_pandas(), train_clean["Hl"].to_pandas())

    def encode(d: pl.DataFrame) -> pl.DataFrame:
        enc = te.transform(d.select(categorical).to_pandas())
        enc = enc.rename(columns={c: f"{c}_te" for c in categorical})
        return pl.concat([d, pl.from_pandas(enc)], how="horizontal")

    train_enc = encode(train_clean)
    feature_cols = numeric + [f"{c}_te" for c in categorical]
    Xtr = train_enc.select(feature_cols).to_numpy()
    ytr = train_enc["Hl"].to_numpy()

    model = lgb.LGBMRegressor(
        objective="quantile", alpha=0.5,
        n_estimators=400, learning_rate=0.05,
        num_leaves=31, min_data_in_leaf=10,
        reg_lambda=0.1,
        random_state=42, verbose=-1,
    )
    model.fit(Xtr, ytr)
    if model.best_iteration_ is None:
        # No early stopping callback used — fake best_iteration_ to last
        model.best_iteration_ = model.n_estimators

    # Build the iteration seed: last row per (brand, sub) from `train_enc`
    seed = (
        train_enc.sort("date")
        .group_by(["brand", "sub_channel"], maintain_order=True)
        .tail(1)
    )
    history_lookup: dict[tuple[str, str], list[float]] = {
        (b, s): grp.sort("date")["Hl"].to_list()
        for (b, s), grp in train_clean.group_by(["brand", "sub_channel"], maintain_order=True)
    }
    return _iterative_lgb_forecast(model, seed, eval_dates, feature_cols, history_lookup)


def predict_statsforecast(
    train_df: pl.DataFrame, eval_dates: list, model_name: str,
) -> dict[tuple[str, str], np.ndarray]:
    """AutoARIMA / AutoETS at brand × sub_channel. Drops series with <12 months."""
    from statsforecast import StatsForecast
    from statsforecast.models import AutoARIMA, AutoETS

    pdf = (
        train_df.with_columns(unique_id=pl.col("brand") + "|" + pl.col("sub_channel"))
        .select(pl.col("unique_id"), pl.col("date").alias("ds"), pl.col("Hl").alias("y"))
        .sort(["unique_id", "ds"])
        .to_pandas()
    )
    counts = pdf.groupby("unique_id").size()
    keep = counts[counts >= 12].index
    pdf = pdf[pdf["unique_id"].isin(keep)]
    if pdf.empty:
        return {}

    model_cls = {"autoarima": AutoARIMA, "autoets": AutoETS}[model_name]
    sf = StatsForecast(models=[model_cls(season_length=12)], freq="MS", n_jobs=-1)
    try:
        sf.fit(pdf)
        fcst = sf.predict(h=len(eval_dates))
    except Exception as e:
        print(f"      ! {model_name} fit/predict failed: {e}")
        return {}

    pred_col = {"autoarima": "AutoARIMA", "autoets": "AutoETS"}[model_name]
    out: dict[tuple[str, str], np.ndarray] = {}
    for uid, grp in fcst.groupby("unique_id"):
        brand, sub = uid.split("|", 1)
        arr = grp.sort_values("ds")[pred_col].to_numpy()
        # statsforecast can return NaN on degenerate series — default to last train value
        if np.any(~np.isfinite(arr)):
            last = pdf[pdf["unique_id"] == uid].sort_values("ds")["y"].iloc[-1]
            arr = np.where(np.isfinite(arr), arr, last)
        out[(brand, sub)] = np.maximum(arr, 0.0)
    return out


def predict_chronos(
    train_df: pl.DataFrame, eval_dates: list,
) -> dict[tuple[str, str], np.ndarray]:
    """Chronos-Bolt zero-shot at brand × sub_channel level.

    Re-runs Chronos on the truncated brand-level history per fold. Cached
    per (brand, sub_channel, history-hash) so re-runs are free.
    """
    try:
        import torch
        from chronos import BaseChronosPipeline
    except ImportError:
        return {}

    series: list[tuple[tuple[str, str], np.ndarray]] = []
    for (brand, sub), grp in train_df.group_by(["brand", "sub_channel"], maintain_order=True):
        h = grp.sort("date")["Hl"].to_numpy()
        if len(h) < 6:
            continue
        series.append(((brand, sub), h))
    if not series:
        return {}

    pipeline = BaseChronosPipeline.from_pretrained("amazon/chronos-bolt-base", device_map="cpu")
    inputs = [torch.tensor(s, dtype=torch.float32) for _, s in series]
    quant_tensor, _ = pipeline.predict_quantiles(
        inputs=inputs,
        prediction_length=len(eval_dates),
        quantile_levels=[0.5],
    )
    arr = quant_tensor.detach().cpu().numpy()  # shape (N, H, 1)
    out: dict[tuple[str, str], np.ndarray] = {}
    for i, (key, _) in enumerate(series):
        out[key] = np.maximum(arr[i, :, 0], 0.0)
    return out


def predict_cmbc(
    train_df: pl.DataFrame, eval_dates: list,
) -> dict[tuple[str, str], np.ndarray]:
    """CMBC specialist: AutoARIMA + SeasonalNaive average — for the FREE TRADE
    CMBC sub-channel only."""
    from statsforecast import StatsForecast
    from statsforecast.models import AutoARIMA, SeasonalNaive

    cmbc = train_df.filter(pl.col("sub_channel") == CMBC_CHANNEL)
    if len(cmbc) == 0:
        return {}
    pdf = (
        cmbc.with_columns(unique_id=pl.col("brand") + "|" + pl.col("sub_channel"))
        .select(pl.col("unique_id"), pl.col("date").alias("ds"), pl.col("Hl").alias("y"))
        .sort(["unique_id", "ds"])
        .to_pandas()
    )
    counts = pdf.groupby("unique_id").size()
    keep = counts[counts >= 6].index
    pdf = pdf[pdf["unique_id"].isin(keep)]
    if pdf.empty:
        return {}

    sf = StatsForecast(
        models=[AutoARIMA(season_length=12), SeasonalNaive(season_length=12)],
        freq="MS", n_jobs=-1,
    )
    try:
        sf.fit(pdf)
        fcst = sf.predict(h=len(eval_dates))
    except Exception:
        return {}

    out: dict[tuple[str, str], np.ndarray] = {}
    for uid, grp in fcst.groupby("unique_id"):
        brand, sub = uid.split("|", 1)
        a = grp.sort_values("ds")["AutoARIMA"].to_numpy()
        s = grp.sort_values("ds")["SeasonalNaive"].to_numpy()
        avg = np.where(np.isfinite(a), a, s)
        avg = (avg + s) / 2.0
        out[(brand, sub)] = np.maximum(avg, 0.0)
    return out


# ──────────────────────────────────────────────────────────────────────────────
# Weight derivation
# ──────────────────────────────────────────────────────────────────────────────


def derive_weights(
    metrics: pl.DataFrame, *,
    sharpness: float = 6.0,
    top_k: int = 3,
    relative_max: float = 1.30,
    cmbc_override: bool = True,
) -> dict[str, dict[str, float]]:
    """Per-sub_channel weights via sharp inverse-WAPE on top-K models.

    Algorithm per sub_channel:
      1. Drop models with non-finite WAPE.
      2. Drop models whose WAPE > relative_max × best WAPE (an under-
         performer that close to a strong winner would only add bias).
      3. Take the top_k survivors.
      4. weight_m ∝ 1 / WAPE_m ** sharpness  →  best model dominates,
         peers contribute only when their accuracy is comparable.
      5. Renormalize.

    For FREE TRADE CMBC the cmbc specialist forecast is preferred (weight=1)
    only when its WAPE is within 5% of the best model — the plan says
    "keep CMBC specialist unless validation proves another model wins".
    Otherwise we fall back to the same generic rule.

    Models with NaN WAPE get weight 0 (they had no prediction for that
    channel and are not in the dict at all).
    """
    out: dict[str, dict[str, float]] = {}
    for ch in metrics["sub_channel"].unique().to_list():
        rows = metrics.filter(pl.col("sub_channel") == ch)
        pairs: list[tuple[str, float]] = []
        for r in rows.iter_rows(named=True):
            w_val = r["wape"]
            if w_val is None or not np.isfinite(w_val):
                continue
            pairs.append((r["model"], float(max(w_val, 0.01))))
        if not pairs:
            out[ch] = {"naive": 1.0}
            continue
        pairs.sort(key=lambda kv: kv[1])
        best_wape = pairs[0][1]

        if cmbc_override and ch == CMBC_CHANNEL:
            cmbc_wape = next((w for m, w in pairs if m == "cmbc"), None)
            if cmbc_wape is not None and cmbc_wape <= best_wape * 1.05:
                out[ch] = {"cmbc": 1.0}
                continue

        # Drop under-performers
        eligible = [(m, w) for m, w in pairs if w <= best_wape * relative_max]
        # Keep at least top_k if available
        if len(eligible) < min(top_k, len(pairs)):
            eligible = pairs[:top_k]
        else:
            eligible = eligible[:top_k]

        scores = [(m, (1.0 / w) ** sharpness) for m, w in eligible]
        total = sum(s for _, s in scores)
        if total <= 0:
            out[ch] = {eligible[0][0]: 1.0}
            continue
        out[ch] = {m: s / total for m, s in scores}
    return out


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────


def main() -> int:
    print("=" * 72)
    print(f"STEP 5 — Model selection: rolling-origin CV at brand × sub_channel")
    print(f"        ({N_FOLDS} folds × {HORIZON}-month horizon)")
    print("=" * 72)

    if not WIDE.is_file():
        print("\n  wide_monthly.parquet not found. Run `make data`.")
        return 2

    monthly = pl.read_parquet(WIDE)
    agg = aggregate_brand_subch(monthly)
    df, numeric, categorical = build_brand_features(agg)
    print(f"\n[1/5] aggregated to {agg.group_by(['brand', 'sub_channel']).len().height} brand×sub_channel series")
    print(f"      history: {agg['date'].min()} → {agg['date'].max()}  "
          f"({agg.shape[0]:,} rows total)")

    sorted_dates = sorted(agg["date"].unique().to_list())
    if len(sorted_dates) < N_FOLDS + HORIZON + 12:
        print(f"      ! too few months ({len(sorted_dates)}) for CV — proceeding with what we have")
    cutoffs = sorted_dates[-(N_FOLDS + HORIZON):-HORIZON]
    print(f"      fold cutoffs: {cutoffs}")

    # Run all folds for all models
    print(f"\n[2/5] running rolling folds")
    oof_rows: list[dict] = []

    for fi, cutoff in enumerate(cutoffs, 1):
        eval_dates = [d for d in sorted_dates if d > cutoff][:HORIZON]
        if len(eval_dates) < HORIZON:
            print(f"      fold {fi}: insufficient eval window — skipping")
            continue
        train_df = df.filter(pl.col("date") <= cutoff)
        eval_df = agg.filter(pl.col("date").is_in(eval_dates))
        actuals = {
            (r["brand"], r["sub_channel"]): r
            for r in eval_df.iter_rows(named=True)
        }
        # Build per-(brand, sub) actual arrays in eval_dates order
        actual_lookup: dict[tuple[str, str], np.ndarray] = {}
        for (brand, sub), grp in eval_df.group_by(["brand", "sub_channel"], maintain_order=True):
            order = grp.sort("date")
            arr = np.zeros(len(eval_dates), dtype=np.float64)
            for d_i, d in enumerate(eval_dates):
                row = order.filter(pl.col("date") == d)
                arr[d_i] = float(row["Hl"][0]) if len(row) else 0.0
            actual_lookup[(brand, sub)] = arr

        print(f"\n      ── fold {fi} cutoff={cutoff}  eval={eval_dates[0]}..{eval_dates[-1]}")

        train_agg = train_df.select(["brand", "sub_channel", "date", "Hl"]).drop_nulls()
        baselines_pred = predict_baselines(train_agg, eval_dates)

        try:
            brand_lgb_pred = predict_brand_lgb(train_df, df, eval_dates, numeric, categorical)
        except Exception as e:
            print(f"        ! brand_lgb failed: {e}")
            brand_lgb_pred = {}
        autoarima_pred = predict_statsforecast(train_agg, eval_dates, "autoarima")
        autoets_pred   = predict_statsforecast(train_agg, eval_dates, "autoets")
        try:
            chronos_pred = predict_chronos(train_agg, eval_dates)
        except Exception as e:
            print(f"        ! chronos failed: {e}")
            chronos_pred = {}
        cmbc_pred = predict_cmbc(train_agg, eval_dates)

        all_preds: dict[str, dict[tuple[str, str], np.ndarray]] = {
            **baselines_pred,
            "brand_lgb": brand_lgb_pred,
            "autoarima": autoarima_pred,
            "autoets":   autoets_pred,
            "chronos":   chronos_pred,
            "cmbc":      cmbc_pred,
        }

        for model_name, preds in all_preds.items():
            for (brand, sub), arr in preds.items():
                actuals_arr = actual_lookup.get((brand, sub))
                if actuals_arr is None:
                    continue
                for h, d in enumerate(eval_dates):
                    oof_rows.append({
                        "fold": fi,
                        "cutoff": cutoff,
                        "brand": brand,
                        "sub_channel": sub,
                        "date": d,
                        "horizon": h + 1,
                        "model": model_name,
                        "y": float(actuals_arr[h]),
                        "yhat": float(arr[h]),
                    })

        # Print per-model fold WAPE for visibility
        for model_name in [m for m in ALL_MODELS if m in all_preds]:
            preds = all_preds[model_name]
            ys, ps = [], []
            for k, arr in preds.items():
                a = actual_lookup.get(k)
                if a is None:
                    continue
                ys.append(a)
                ps.append(arr)
            if not ys:
                continue
            y_all = np.concatenate(ys)
            p_all = np.concatenate(ps)
            print(f"        {model_name:<12} fold WAPE = {m_wape(y_all, p_all):.3f}  "
                  f"(n_series={len(ys)})")

    if not oof_rows:
        print("\n  ! no OOF predictions produced — aborting")
        return 1

    oof = pl.DataFrame(oof_rows)
    print(f"\n[3/5] {len(oof):,} OOF predictions collected")

    print(f"\n[4/5] computing metrics by sub_channel and aggregate levels")
    metric_rows: list[dict] = []

    # Brand × sub_channel level — one row per (sub_channel, model)
    for (sub, model), grp in oof.group_by(["sub_channel", "model"], maintain_order=True):
        y = grp["y"].to_numpy()
        p = grp["yhat"].to_numpy()
        metric_rows.append({
            "level": "brand_subchannel",
            "sub_channel": sub,
            "model": model,
            "wape":   m_wape(y, p),
            "mae_hl": m_mae(y, p),
            "bias_hl": m_bias(y, p),
            "smape": m_smape(y, p),
            "n_obs": int(len(y)),
        })

    # Sub-channel level (sum brand-level forecasts per (sub_channel, fold, date))
    sub_agg = (
        oof.group_by(["fold", "sub_channel", "date", "model"])
        .agg(pl.col("y").sum(), pl.col("yhat").sum())
    )
    for (sub, model), grp in sub_agg.group_by(["sub_channel", "model"], maintain_order=True):
        y = grp["y"].to_numpy()
        p = grp["yhat"].to_numpy()
        metric_rows.append({
            "level": "subchannel",
            "sub_channel": sub,
            "model": model,
            "wape":   m_wape(y, p),
            "mae_hl": m_mae(y, p),
            "bias_hl": m_bias(y, p),
            "smape": m_smape(y, p),
            "n_obs": int(len(y)),
        })

    # Sales-channel level (need sales mapping)
    sub_to_sales = monthly.select(["sub_channel", "sales_channel"]).unique()
    oof_sales = oof.join(sub_to_sales, on="sub_channel", how="left")
    sales_agg = (
        oof_sales.group_by(["fold", "sales_channel", "date", "model"])
        .agg(pl.col("y").sum(), pl.col("yhat").sum())
    )
    for (sales, model), grp in sales_agg.group_by(["sales_channel", "model"], maintain_order=True):
        y = grp["y"].to_numpy()
        p = grp["yhat"].to_numpy()
        metric_rows.append({
            "level": "sales_channel",
            "sub_channel": sales,
            "model": model,
            "wape":   m_wape(y, p),
            "mae_hl": m_mae(y, p),
            "bias_hl": m_bias(y, p),
            "smape": m_smape(y, p),
            "n_obs": int(len(y)),
        })

    # Total UK level
    total_agg = (
        oof.group_by(["fold", "date", "model"])
        .agg(pl.col("y").sum(), pl.col("yhat").sum())
    )
    for (model,), grp in total_agg.group_by(["model"], maintain_order=True):
        y = grp["y"].to_numpy()
        p = grp["yhat"].to_numpy()
        metric_rows.append({
            "level": "total_uk",
            "sub_channel": "TOTAL_UK",
            "model": model,
            "wape":   m_wape(y, p),
            "mae_hl": m_mae(y, p),
            "bias_hl": m_bias(y, p),
            "smape": m_smape(y, p),
            "n_obs": int(len(y)),
        })

    metrics = pl.DataFrame(metric_rows)
    SNAPSHOTS.mkdir(parents=True, exist_ok=True)
    metrics.write_parquet(SNAPSHOTS / "model_metrics.parquet")
    oof.write_parquet(SNAPSHOTS / "model_cv_predictions.parquet")
    print(f"      snapshots/model_metrics.parquet         ({len(metrics):,} rows)")
    print(f"      snapshots/model_cv_predictions.parquet  ({len(oof):,} rows)")

    # Print headline brand-level WAPE per channel/model
    head = (
        metrics.filter(pl.col("level") == "brand_subchannel")
        .pivot(values="wape", index="sub_channel", on="model", aggregate_function="first")
    )
    print(f"\n      Brand × sub_channel WAPE (lower is better):")
    print(head.to_pandas().to_string(index=False))

    print(f"\n[5/5] deriving per-sub_channel weights")
    # Weights from brand_subchannel level metrics
    bs_metrics = metrics.filter(pl.col("level") == "brand_subchannel")
    weights = derive_weights(bs_metrics)
    selection = {
        "weights": weights,
        "metadata": {
            "n_folds": N_FOLDS,
            "horizon": HORIZON,
            "cutoffs": [str(c) for c in cutoffs],
            "models_evaluated": ALL_MODELS,
            "primary_metric": "wape",
            "level_for_weights": "brand_subchannel",
        },
    }
    out_path = MODELS / "model_selection.json"
    out_path.write_text(json.dumps(selection, indent=2, default=str))
    print(f"      models/model_selection.json")
    print(f"\n      learned weights:")
    for ch, ws in weights.items():
        rendered = "  ".join(f"{m}={w:.2f}" for m, w in sorted(ws.items(), key=lambda kv: -kv[1]))
        print(f"        {ch:<26} {rendered}")

    print("\nSTEP 5 done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
