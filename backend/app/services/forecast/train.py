"""Train orchestrator — runs all 11 Phase-2 training steps in dependency order.

Run with:  make train       (or: PYTHONHASHSEED=42 uv run python -m app.services.forecast.train)

Each step is its own module — this file just calls them in sequence and
fails loudly if any step exits non-zero. The order matters because each
step's output feeds the next:

    1. train_lgb   → models/lgb_p{10,50,90}.joblib + learning_curves.parquet
    2. autoarima   → forecasts_autoarima.parquet
    3. zeroshot    → forecasts_zeroshot.parquet (Chronos + chronos_promo)
    4. cmbc        → forecasts_cmbc.parquet
    5. ensemble    → forecast.parquet ← canonical snapshot every endpoint reads
    6. reconcile   → forecast_by_{brand_subchannel,subchannel,sales_channel,total}.parquet
    7. calibrate   → calibration.parquet (per-channel qhats) + Hl_hat_p{10,90}_cal columns
    8. cv          → mape.parquet
    9. explain     → drivers.parquet + models/shap_explainer.joblib
   10. anomaly     → anomalies.parquet
   11. causal      → promo_roi.parquet
"""

from __future__ import annotations

import importlib
import sys
import time

STEPS: list[tuple[str, str]] = [
    ("STEP 1",  "app.services.forecast.train_lgb"),
    ("STEP 2",  "app.services.forecast.autoarima"),
    ("STEP 3",  "app.services.forecast.zeroshot"),
    ("STEP 4",  "app.services.forecast.cmbc"),
    ("STEP 5",  "app.services.forecast.ensemble"),
    ("STEP 6",  "app.services.forecast.reconcile"),
    ("STEP 7",  "app.services.forecast.calibrate"),
    ("STEP 8",  "app.services.forecast.cv"),
    ("STEP 9",  "app.services.forecast.explain"),
    ("STEP 10", "app.services.forecast.anomaly"),
    ("STEP 11", "app.services.forecast.causal"),
]


def main() -> int:
    start = time.time()
    print("=" * 78)
    print(f"MarketPulse UK — TRAIN ORCHESTRATOR  ({len(STEPS)} steps)")
    print("=" * 78)
    for label, module_path in STEPS:
        print(f"\n>>> {label} — {module_path}")
        t0 = time.time()
        # Re-import each time so any side effects (lru_caches etc.) are fresh
        if module_path in sys.modules:
            del sys.modules[module_path]
        mod = importlib.import_module(module_path)
        rc = mod.main()
        dt = time.time() - t0
        if rc != 0:
            print(f"\n!!! {label} failed (rc={rc}). Aborting.")
            return rc
        print(f">>> {label} done in {dt:.1f}s")

    print(f"\n{'=' * 78}")
    print(f"all 11 training steps OK in {time.time() - start:.0f}s")
    print(f"{'=' * 78}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
