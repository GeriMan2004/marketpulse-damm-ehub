"""Post-forecast multiplicative seasonality.

The LightGBM ensemble produces a near-flat line at long horizons because
iterative h-step prediction feeds its own (already-averaged) p50 forward
as the lag for the next step — by h=4+ the lags are all predicted means,
which is exactly the conditional mean.

We've already tried teaching the model the missing shape via features
(event-importance flags, planned-promo counts, etc.); both rolled back
because the model can't learn what isn't varied enough in the training
window. See MODEL.md "Rolled-back experiments".

This module takes the opposite tack: leave the model alone, and inject
the historical monthly pattern as a *post-forecast multiplicative
adjustment*. The same playbook as the one-off World Cup / Euros boost
in services/calendar.py — deterministic, transparent, applied to the
ensemble output in services/forecast/ensemble.py.

Math:
  multiplier[brand, sub_channel, month] =
      mean(Hl in that month across all years and SKUs of the brand)
      ÷ mean(Hl across all months of the same brand × sub_channel)

By construction the 12 multipliers per series sum to 12 (mean = 1.0)
*before bounding*. We then clip to [0.55, 1.80] so a freak month doesn't
push a forecast 3× above or 2× below the level, and renormalize so the
*post-bound* 12-month mean is still exactly 1.0. That last step is what
guarantees the annual *level* of the forecast is preserved — only the
*shape* across months changes.

Pooling: brand × sub_channel (not per-SKU). With 3 years of monthly
history a per-SKU per-month bucket has n=3, which is too noisy.
Pooling across all SKUs of a brand for the same channel gives n=30+
per month-of-year for the major brands, which is enough to be stable.
"""

from __future__ import annotations

import polars as pl

# Bounds on a single month's multiplier. Wider on the upside since
# Christmas / summer spikes in this dataset legitimately approach
# +60-80%; downside is tighter because Jan/Feb floors near -50% are
# more plausibly noise than signal at small n.
SEASONAL_BOUNDS: tuple[float, float] = (0.55, 1.80)

# Per-month minimum observations before we trust a (brand × sub_channel)
# series enough to produce indices for it. Below this, we leave the
# multiplier at 1.0 (no shape injection) rather than risk amplifying
# noise.
MIN_OBS_PER_MONTH: int = 3


def compute_seasonality_multipliers(
    monthly: pl.DataFrame,
) -> dict[tuple[str, str, int], float]:
    """Build {(brand, sub_channel, month_of_year) -> multiplier}.

    monthly: wide_monthly.parquet shape — material_id, brand, sub_channel,
             date, Hl, plus the columns ETL attaches. Only `brand`,
             `sub_channel`, `date`, `Hl` are read.

    Returns an empty dict if no series has enough history. Missing keys
    in the dict are interpreted by callers as multiplier = 1.0.
    """
    if monthly.is_empty():
        return {}
    df = monthly.with_columns(month=pl.col("date").dt.month())

    by_bcm = (
        df.group_by(["brand", "sub_channel", "month"])
        .agg(mean_hl=pl.col("Hl").mean(), n=pl.len())
    )

    out: dict[tuple[str, str, int], float] = {}
    for (brand, sub), grp in by_bcm.group_by(["brand", "sub_channel"]):
        per_month = {r["month"]: (r["mean_hl"], r["n"]) for r in grp.iter_rows(named=True)}
        # Need full 12-month coverage and enough obs per month.
        if len(per_month) < 12:
            continue
        if any(n < MIN_OBS_PER_MONTH for _, n in per_month.values()):
            continue
        all_mean = sum(v for v, _ in per_month.values()) / 12
        if all_mean <= 0:
            continue

        # Raw multipliers + bounding.
        bounded = {
            m: max(SEASONAL_BOUNDS[0], min(SEASONAL_BOUNDS[1], val / all_mean))
            for m, (val, _) in per_month.items()
        }
        # Renormalize so the 12-month mean is exactly 1.0 post-bounding.
        # Without this, clipped series would shift their annual level.
        local_mean = sum(bounded.values()) / 12
        if local_mean <= 0:
            continue
        for m, mult in bounded.items():
            out[(brand, sub, m)] = mult / local_mean

    return out


def apply_seasonality(
    forecast: pl.DataFrame,
    multipliers: dict[tuple[str, str, int], float],
) -> pl.DataFrame:
    """Multiply Hl_hat_p10 / p50 / p90 by the per-month multiplier.

    The forecast frame must have `brand`, `sub_channel`, `date`, and the
    three quantile columns. Rows whose (brand, sub_channel, month) key
    isn't in `multipliers` are left at 1.0 (untouched).
    """
    if not multipliers:
        return forecast

    def _mult(row: dict) -> float:
        key = (row["brand"], row["sub_channel"], row["date"].month)
        return multipliers.get(key, 1.0)

    return (
        forecast.with_columns(
            pl.struct(["brand", "sub_channel", "date"])
            .map_elements(_mult, return_dtype=pl.Float64)
            .alias("_seasonal"),
        )
        .with_columns(
            (pl.col("Hl_hat_p10") * pl.col("_seasonal")).alias("Hl_hat_p10"),
            (pl.col("Hl_hat_p50") * pl.col("_seasonal")).alias("Hl_hat_p50"),
            (pl.col("Hl_hat_p90") * pl.col("_seasonal")).alias("Hl_hat_p90"),
        )
        .drop("_seasonal")
    )
