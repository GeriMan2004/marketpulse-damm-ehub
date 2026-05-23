"""Train orchestrator — runs all 12 Phase-2 training steps in dependency order.

Run with:  make train       (or: PYTHONHASHSEED=42 uv run python -m app.services.forecast.train)
Verbose:   TRAIN_VERBOSE=1 make train     (shows full per-step output)

Each step is its own module — this orchestrator just calls them in sequence
and fails loudly if any step exits non-zero. Per-step stdout/stderr is
captured and silenced on success (set TRAIN_VERBOSE=1 to see it).
On failure the captured output is dumped so you can see what broke.

After all steps succeed, a single FINAL REPORT block reads the produced
artifacts and prints the headline numbers:
  - Brand × sub_channel WAPE per channel (primary metric)
  - SKU × sub_channel WAPE / MAE / bias / sMAPE
  - Selected ensemble weight per channel (top model)
  - Calibration coverage (raw vs cal)
  - Forecast totals by sales channel + total UK
  - Anomalies count, promo ROI count

Step pipeline:
    1. train_lgb         → models/lgb_p{10,50,90}.joblib + learning_curves.parquet
    2. autoarima         → forecasts_autoarima.parquet
    3. zeroshot          → forecasts_zeroshot.parquet (Chronos + chronos_promo)
    4. cmbc              → forecasts_cmbc.parquet
    5. model_selection   → model_metrics.parquet + model_cv_predictions.parquet
                            + models/model_selection.json
    6. ensemble          → forecast.parquet ← canonical snapshot every endpoint reads
    7. reconcile         → forecast_by_{brand_subchannel,subchannel,sales_channel,total}.parquet
    8. calibrate         → calibration.parquet + Hl_hat_p{10,90}_cal columns
    9. cv                → mape.parquet (legacy MAPE table + WAPE/MAE/bias/sMAPE)
   10. explain           → drivers.parquet + models/shap_explainer.joblib
   11. anomaly           → anomalies.parquet
   12. causal            → promo_roi.parquet
"""

from __future__ import annotations

import contextlib
import importlib
import io
import json
import os
import sys
import tempfile
import time
import warnings
from pathlib import Path

# ── Quiet third-party noise (matplotlib temp dir, polars dtype heuristics,
# loky core-count, statsforecast RuntimeWarnings, HF retry banners,
# fontconfig cache writes) so the console only shows our own narrative.
warnings.filterwarnings("ignore")
os.environ.setdefault("PYTHONWARNINGS", "ignore")
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
os.environ.setdefault("HF_HUB_VERBOSITY", "error")
os.environ.setdefault("POLARS_VERBOSE", "0")
_writable_cache = tempfile.gettempdir()
os.environ.setdefault("MPLCONFIGDIR", str(Path(_writable_cache) / "mpl-cache"))

ROOT = Path(__file__).resolve().parents[3]
SNAPSHOTS = ROOT / "app" / "data" / "snapshots"
MODELS = ROOT / "models"

VERBOSE = os.environ.get("TRAIN_VERBOSE", "").lower() in ("1", "true", "yes")

STEPS: list[tuple[str, str]] = [
    ("STEP 1",  "app.services.forecast.train_lgb"),
    ("STEP 2",  "app.services.forecast.autoarima"),
    ("STEP 3",  "app.services.forecast.zeroshot"),
    ("STEP 4",  "app.services.forecast.cmbc"),
    ("STEP 5",  "app.services.forecast.model_selection"),
    ("STEP 6",  "app.services.forecast.ensemble"),
    ("STEP 7",  "app.services.forecast.reconcile"),
    ("STEP 8",  "app.services.forecast.calibrate"),
    ("STEP 9",  "app.services.forecast.cv"),
    ("STEP 10", "app.services.forecast.explain"),
    ("STEP 11", "app.services.forecast.anomaly"),
    ("STEP 12", "app.services.forecast.causal"),
]


@contextlib.contextmanager
def _silenced_fds():
    """Redirect file descriptors 1 and 2 to a temp file so that even
    C-level libraries (polars dtype warnings, fontconfig errors, joblib
    loky banners, HF retry text) don't leak to the user's terminal.

    Yields the path to the captured output so the orchestrator can dump
    it on failure.
    """
    saved_out, saved_err = os.dup(1), os.dup(2)
    sys.stdout.flush()
    sys.stderr.flush()
    tmp = tempfile.NamedTemporaryFile(mode="w+", delete=False, encoding="utf-8")
    try:
        os.dup2(tmp.fileno(), 1)
        os.dup2(tmp.fileno(), 2)
        yield tmp.name
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
        os.dup2(saved_out, 1)
        os.dup2(saved_err, 2)
        os.close(saved_out)
        os.close(saved_err)
        tmp.close()


def _run_step(module_path: str) -> tuple[int, str]:
    """Run a step's main() with stdout/stderr fully silenced. Returns
    (rc, captured_output) so the orchestrator can dump output on failure."""
    if module_path in sys.modules:
        del sys.modules[module_path]
    if VERBOSE:
        mod = importlib.import_module(module_path)
        return mod.main(), ""
    with _silenced_fds() as captured_path:
        try:
            mod = importlib.import_module(module_path)
            rc = mod.main()
        except SystemExit as e:
            rc = int(e.code) if e.code is not None else 0
    try:
        captured = Path(captured_path).read_text()
    except Exception:
        captured = ""
    finally:
        try:
            os.unlink(captured_path)
        except FileNotFoundError:
            pass
    return rc, captured


def _print_final_report() -> None:
    """One-shot summary of every metric the team actually looks at."""
    import polars as pl

    print()
    print("=" * 78)
    print("FINAL REPORT")
    print("=" * 78)

    # ── Data shape ────────────────────────────────────────────────────────
    monthly = pl.read_parquet(SNAPSHOTS / "wide_monthly.parquet")
    fc = pl.read_parquet(SNAPSHOTS / "forecast.parquet")
    n_brand_subch = monthly.group_by(["brand", "sub_channel"]).len().height
    n_series = monthly.group_by(["material_id", "sub_channel"]).len().height
    print(f"\nData")
    print(f"  history       {monthly['date'].min()} → {monthly['date'].max()}   "
          f"{monthly['date'].n_unique()} months · {n_series} series · "
          f"{n_brand_subch} brand×sub_channel")
    print(f"  forecast      {fc['date'].min()} → {fc['date'].max()}   "
          f"{fc['date'].n_unique()} months · {len(fc):,} SKU rows · "
          f"{float(fc['Hl_hat_p50'].sum()):,.0f} Hl total")

    # ── Brand × sub_channel WAPE (primary metric) ─────────────────────────
    mm_path = SNAPSHOTS / "model_metrics.parquet"
    sel_path = MODELS / "model_selection.json"
    if mm_path.is_file() and sel_path.is_file():
        mm = pl.read_parquet(mm_path).filter(pl.col("level") == "brand_subchannel")
        selection = json.loads(sel_path.read_text())
        weights = selection.get("weights", {})

        print(f"\nBrand × sub_channel WAPE  (primary metric, lower is better)")
        print(f"  {'sub_channel':<26}  {'best_model':<14} {'best_WAPE':>10}  "
              f"{'top_weight':<22}")
        # one row per sub_channel: best individual model + its WAPE + selected weight head
        for ch in sorted(mm["sub_channel"].unique().to_list()):
            ch_rows = mm.filter(pl.col("sub_channel") == ch).sort("wape")
            if not len(ch_rows):
                continue
            best = ch_rows.row(0, named=True)
            ws = weights.get(ch, {})
            top = sorted(ws.items(), key=lambda kv: -kv[1])
            top_str = "  ".join(f"{m}={w:.2f}" for m, w in top[:3])
            print(f"  {ch:<26}  {best['model']:<14} {best['wape']:>10.3f}  {top_str}")

        # Top-level summary across brand_subchannel pool
        agg_w = float((mm["wape"] * mm["n_obs"]).sum() / max(mm["n_obs"].sum(), 1))
        print(f"  {'(volume-weighted mean)':<26}  {'—':<14} {agg_w:>10.3f}")

    # ── SKU-level metrics from cv.py ──────────────────────────────────────
    mape_path = SNAPSHOTS / "mape.parquet"
    if mape_path.is_file():
        cv = pl.read_parquet(mape_path)
        print(f"\nSKU × sub_channel CV  (rolling-origin, 3-fold × 3-month)")
        for r in cv.iter_rows(named=True):
            print(f"  {r['level']:<22}  WAPE={r['wape']:.3f}   "
                  f"MAE={r['mae_hl']:>7.1f} Hl   "
                  f"bias={r['bias_hl']:+.1f} Hl   "
                  f"sMAPE={r['smape']:.3f}")

    # ── Calibration coverage ──────────────────────────────────────────────
    cal_path = SNAPSHOTS / "calibration.parquet"
    if cal_path.is_file():
        cal = pl.read_parquet(cal_path)
        # The first calibration.parquet has overall + per-channel rows; we
        # show per-channel qhats which is what STEP 8 writes today.
        if "qhat" in cal.columns and "sub_channel" in cal.columns:
            print(f"\nPrediction-interval calibration (per channel, 80% target)")
            for r in cal.sort("qhat").iter_rows(named=True):
                print(f"  {r['sub_channel']:<26}  qhat = {r['qhat']:>8.2f} Hl")

    # ── Sales-channel totals ──────────────────────────────────────────────
    total_path = SNAPSHOTS / "forecast_by_total.parquet"
    sales_path = SNAPSHOTS / "forecast_by_sales_channel.parquet"
    if sales_path.is_file() and total_path.is_file():
        sales = (
            pl.read_parquet(sales_path)
            .group_by("sales_channel")
            .agg(pl.col("Hl_hat_p50").sum().alias("total_hl"))
            .sort("total_hl", descending=True)
        )
        total = float(pl.read_parquet(total_path)["Hl_hat_p50"].sum())
        print(f"\nForecast totals (next 9 months)")
        for r in sales.iter_rows(named=True):
            print(f"  {r['sales_channel']:<22}  {r['total_hl']:>11,.0f} Hl")
        print(f"  {'TOTAL UK':<22}  {total:>11,.0f} Hl")

    # ── Diagnostics ───────────────────────────────────────────────────────
    diag_lines: list[str] = []
    anom = SNAPSHOTS / "anomalies.parquet"
    if anom.is_file():
        diag_lines.append(f"  anomalies flagged   {len(pl.read_parquet(anom))}")
    promo = SNAPSHOTS / "promo_roi.parquet"
    if promo.is_file():
        diag_lines.append(f"  promo ROI rows      {len(pl.read_parquet(promo))}")
    drivers = SNAPSHOTS / "drivers.parquet"
    if drivers.is_file():
        diag_lines.append(f"  driver rows (SHAP)  {len(pl.read_parquet(drivers))}")
    if diag_lines:
        print(f"\nDiagnostics")
        for line in diag_lines:
            print(line)
    print()


def main() -> int:
    start = time.time()
    print("=" * 78)
    print(f"MarketPulse UK — TRAIN  ({len(STEPS)} steps)"
          + ("    [verbose]" if VERBOSE else ""))
    print("=" * 78)

    for label, module_path in STEPS:
        t0 = time.time()
        try:
            rc, captured = _run_step(module_path)
        except Exception as e:
            print(f"  ✗ {label:<8} {module_path.split('.')[-1]:<18} crashed: {e!r}")
            return 1
        dt = time.time() - t0
        short = module_path.split(".")[-1]
        if rc != 0:
            if captured:
                sys.stdout.write(captured)
            print(f"  ✗ {label:<8} {short:<18} failed (rc={rc}) after {dt:.1f}s")
            return rc
        print(f"  ✓ {label:<8} {short:<18} {dt:>6.1f}s")

    print("-" * 78)
    print(f"all {len(STEPS)} steps OK in {time.time() - start:.0f}s")

    try:
        _print_final_report()
    except Exception as e:
        # The summary is informational; never let it mask a successful train.
        print(f"\n(could not print final report: {e!r})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
