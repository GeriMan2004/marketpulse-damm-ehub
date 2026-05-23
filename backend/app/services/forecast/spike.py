"""Phase-2 spike — quantile LightGBM with early stopping on real Phase 1 data.

This is NOT the production training pipeline. It's a focused demonstration
that proves the overfitting-control plan ([DECISIONS.md D-010]) works
end-to-end against `wide_monthly.parquet`. The real `forecast.train` module
(coming in Phase 2) will use MLForecast wrappers and ensemble with Chronos
+ Moirai; this spike strips that down to a single quantile model so you can
clearly see the learning curve and where early stopping fires.

Run with:  cd backend && PYTHONHASHSEED=42 uv run python -m app.services.forecast.spike
"""

from __future__ import annotations

import time
from pathlib import Path

import lightgbm as lgb
import numpy as np
import polars as pl

ROOT = Path(__file__).resolve().parents[3]
WIDE = ROOT / "app" / "data" / "snapshots" / "wide_monthly.parquet"
OUT  = ROOT / "app" / "data" / "snapshots"

QUANTILES = {"p10": 0.1, "p50": 0.5, "p90": 0.9}


def build_features(monthly: pl.DataFrame) -> pl.DataFrame:
    """Add per-series lags + rolling means. Sort by series + date first."""
    df = monthly.sort(["material_id", "sub_channel", "date"])
    series_keys = ["material_id", "sub_channel"]
    feature_cols = []
    for lag in (1, 3, 6, 12):
        col = f"lag_{lag}"
        df = df.with_columns(pl.col("Hl").shift(lag).over(series_keys).alias(col))
        feature_cols.append(col)
    for window in (3, 6, 12):
        col = f"roll_mean_{window}"
        df = df.with_columns(
            pl.col("Hl").shift(1).rolling_mean(window_size=window, min_samples=1)
              .over(series_keys).alias(col),
        )
        feature_cols.append(col)
    feature_cols += ["month", "quarter", "year", "uk_holidays_count"]
    return df, feature_cols


def encode_categoricals(df: pl.DataFrame) -> tuple[pl.DataFrame, list[str]]:
    """Target-encode brand + sub_channel using only training data later, but for
    the spike just integer-encode them (deterministic, no leakage at this scope)."""
    df = df.with_columns(
        pl.col("brand").rank("dense").alias("brand_id").cast(pl.Int32),
        pl.col("sub_channel").rank("dense").alias("sub_channel_id").cast(pl.Int32),
        pl.col("sales_channel").rank("dense").alias("sales_channel_id").cast(pl.Int32),
    )
    return df, ["brand_id", "sub_channel_id", "sales_channel_id"]


def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Mean Absolute Percentage Error, ignoring zeros."""
    mask = y_true > 0
    if not mask.any():
        return float("nan")
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])))


def main() -> int:
    print("=" * 72)
    print("Phase 2 spike — quantile LightGBM with early stopping")
    print("=" * 72)
    if not WIDE.is_file():
        print(f"\n  wide_monthly.parquet not found at {WIDE}\n  Run `make data` first.")
        return 2

    df = pl.read_parquet(WIDE)
    print(f"\n[1/5] Loaded {len(df):,} rows from wide_monthly.parquet")
    print(f"      date range: {df['date'].min()} → {df['date'].max()}")

    print("\n[2/5] Building lag/rolling features + categorical encoding")
    df, feature_cols = build_features(df)
    df, cat_cols = encode_categoricals(df)
    feature_cols = feature_cols + cat_cols
    df = df.drop_nulls(subset=feature_cols + ["Hl"])  # drop early months without 12-mo lag
    print(f"      after feature build + dropna: {len(df):,} rows")
    print(f"      {len(feature_cols)} features: {feature_cols}")

    # Time-based train / val / test split — never shuffle on time series
    last_date  = df["date"].max()
    test_start = last_date - pl.duration(weeks=12)         # last ~3 months = test
    val_start  = test_start - pl.duration(weeks=12)        # next ~3 months back = val (early-stopping signal)

    train = df.filter(pl.col("date") < val_start)
    val   = df.filter((pl.col("date") >= val_start) & (pl.col("date") < test_start))
    test  = df.filter(pl.col("date") >= test_start)
    print(f"\n[3/5] Split (time-based, no shuffle):")
    print(f"      train: {len(train):>5,} rows  ({train['date'].min()} → {train['date'].max()})")
    print(f"      val:   {len(val):>5,} rows  ({val['date'].min()} → {val['date'].max()})")
    print(f"      test:  {len(test):>5,} rows  ({test['date'].min()} → {test['date'].max()})")

    Xtr, ytr = train.select(feature_cols).to_numpy(), train["Hl"].to_numpy()
    Xva, yva = val.select(feature_cols).to_numpy(),   val["Hl"].to_numpy()
    Xte, yte = test.select(feature_cols).to_numpy(),  test["Hl"].to_numpy()

    print("\n[4/5] Training 3 quantile models with early_stopping(50, max=1500)")
    fitted: dict[str, lgb.LGBMRegressor] = {}
    learning_curves: list[dict] = []

    for name, alpha in QUANTILES.items():
        eval_dict: dict = {}
        m = lgb.LGBMRegressor(
            objective="quantile", alpha=alpha,
            n_estimators=1500, learning_rate=0.05,
            num_leaves=63, min_data_in_leaf=20,
            reg_lambda=0.1,
            verbose=-1,
        )
        t0 = time.time()
        m.fit(
            Xtr, ytr,
            eval_set=[(Xtr, ytr), (Xva, yva)],
            eval_names=["train", "val"],
            eval_metric="mape",
            callbacks=[
                lgb.early_stopping(stopping_rounds=50, verbose=False),
                lgb.record_evaluation(eval_dict),
            ],
        )
        dt = time.time() - t0
        train_mapes = eval_dict["train"]["mape"]
        val_mapes   = eval_dict["val"]["mape"]
        bi = m.best_iteration_
        print(
            f"      {name} (α={alpha}): "
            f"stopped at {bi:>4} of 1500   "
            f"train MAPE {train_mapes[bi-1]:.3f}  "
            f"val MAPE {val_mapes[bi-1]:.3f}  "
            f"({dt:.1f}s)"
        )
        fitted[name] = m
        for it, (tr, vl) in enumerate(zip(train_mapes, val_mapes), start=1):
            learning_curves.append({
                "quantile": name, "iteration": it,
                "train_mape": tr, "val_mape": vl,
                "is_best": it == bi,
            })

    print("\n[5/5] Evaluating on held-out test set + persisting learning curves")
    yhat = fitted["p50"].predict(Xte, num_iteration=fitted["p50"].best_iteration_)
    test_mape = mape(yte, yhat)
    print(f"      held-out test MAPE (p50): {test_mape:.3f}")

    yhat_lo = fitted["p10"].predict(Xte, num_iteration=fitted["p10"].best_iteration_)
    yhat_hi = fitted["p90"].predict(Xte, num_iteration=fitted["p90"].best_iteration_)
    inside = ((yte >= yhat_lo) & (yte <= yhat_hi)).mean()
    print(f"      80% interval coverage on test: {inside:.1%}  (target: ~80%)")

    # Persist learning curve artifact
    lc_df = pl.DataFrame(learning_curves)
    lc_df.write_parquet(OUT / "learning_curves.parquet")
    print(f"      wrote {OUT / 'learning_curves.parquet'}  ({len(lc_df):,} rows)")

    # Brand-level breakdown — the dashboard accuracy panel needs this
    print("\nBy brand (top 5 by test volume):")
    test_full = test.with_columns(
        pl.Series("yhat_p50", yhat),
        pl.Series("yhat_p10", yhat_lo),
        pl.Series("yhat_p90", yhat_hi),
    )
    by_brand = (
        test_full.group_by("brand")
        .agg(
            pl.col("Hl").sum().alias("test_hl"),
            pl.col("Hl").len().alias("n_rows"),
            ((pl.col("Hl") - pl.col("yhat_p50")).abs() / pl.col("Hl").clip(lower_bound=1)).mean().alias("mape"),
        )
        .sort("test_hl", descending=True)
        .head(5)
    )
    print(by_brand)

    print("\nSanity check vs DoD gates:")
    for name, m in fitted.items():
        bi = m.best_iteration_
        train_at_bi = eval_dict_for_quantile(learning_curves, name, "train_mape", bi)
        val_at_bi   = eval_dict_for_quantile(learning_curves, name, "val_mape", bi)
        gate1 = bi < 1500
        gate2 = val_at_bi < train_at_bi * 1.5 if train_at_bi > 0 else True
        print(f"  {name}: best_iteration={bi:<5}  "
              f"gate(best<1500)={'✓' if gate1 else '✗'}   "
              f"gate(val<train×1.5)={'✓' if gate2 else '✗'}  "
              f"(val={val_at_bi:.3f} vs train×1.5={train_at_bi*1.5:.3f})")
    return 0


def eval_dict_for_quantile(curves: list[dict], q: str, key: str, iteration: int) -> float:
    for row in curves:
        if row["quantile"] == q and row["iteration"] == iteration:
            return float(row[key])
    return float("nan")


if __name__ == "__main__":
    raise SystemExit(main())
