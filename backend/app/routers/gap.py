"""GET /api/gap — joins forecast × targets, filters out model-collapse rows.

Adds a `forecast_quality` score in [0, 1] per row, computed from the ratio
of the median forecast to the predicted upper bound. SKUs where the model
has no signal (p50 near zero with a wide p90 band) get quality near 0 and
are excluded from the inbox by default — they look like -98% gaps but
they're actually "the model gave up".

Query params:
  brand, sub_channel        — filters
  from, to                  — period range (YYYY-MM)
  sort                      — gap_pct_asc | gap_pct_desc | gap_hl_asc | gap_hl_desc
  limit                     — max rows
  min_quality               — drop rows below this forecast quality (default 0.15)
                              set to 0 to see everything (including model failures)
"""

from functools import lru_cache
from pathlib import Path

import polars as pl
from fastapi import APIRouter, HTTPException, Query

from app.schemas import GapItem

router = APIRouter(prefix="/api", tags=["gap"])

FORECAST = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "forecast.parquet"
TARGETS  = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "targets.parquet"


@lru_cache(maxsize=1)
def _gap_table() -> pl.DataFrame:
    if not FORECAST.is_file() or not TARGETS.is_file():
        raise HTTPException(status_code=503, detail="forecast.parquet or targets.parquet missing")
    fc = pl.read_parquet(FORECAST)
    tg = pl.read_parquet(TARGETS)
    return (
        fc.join(tg, on=["material_id", "sub_channel", "date"], how="left")
          .with_columns(
              gap_hl=(pl.col("Hl_hat_p50") - pl.col("target_hl")),
              # Clip gap_pct so we don't render -3000% chips for division-by-tiny
              gap_pct=((pl.col("Hl_hat_p50") - pl.col("target_hl")) / pl.col("target_hl").clip(lower_bound=1)).clip(
                  lower_bound=-1.0, upper_bound=5.0,
              ),
              # Forecast quality: p50 relative to the upper bound. Wide-band
              # collapses (p50 ≈ 0 with p90 large) score near 0.
              forecast_quality=(
                  pl.col("Hl_hat_p50") / pl.max_horizontal(pl.col("Hl_hat_p90"), pl.lit(1.0))
              ).clip(lower_bound=0.0, upper_bound=1.0),
          )
          .with_columns(
              confidence=(
                  pl.when(pl.col("forecast_quality") >= 0.4).then(pl.lit("high"))
                    .when(pl.col("forecast_quality") >= 0.2).then(pl.lit("medium"))
                    .otherwise(pl.lit("low"))
              ),
          )
    )


@router.get("/gap", response_model=list[GapItem])
def get_gap(
    brand: str | None = Query(default=None),
    sub_channel: str | None = Query(default=None),
    period_from: str | None = Query(default=None, alias="from"),
    period_to: str | None = Query(default=None, alias="to"),
    sort: str = Query(default="gap_hl_asc"),  # biggest absolute Hl bleed first
    limit: int = Query(default=50, ge=1, le=200),
    min_quality: float = Query(default=0.25, ge=0.0, le=1.0),
) -> list[GapItem]:
    df = _gap_table()
    if brand:
        df = df.filter(pl.col("brand") == brand)
    if sub_channel:
        df = df.filter(pl.col("sub_channel") == sub_channel)
    if min_quality > 0:
        df = df.filter(pl.col("forecast_quality") >= min_quality)

    # Sort logic
    sort_col = "gap_pct" if sort.startswith("gap_pct") else "gap_hl"
    df = df.sort(sort_col, descending=sort.endswith("_desc"))

    return [
        GapItem(
            sku=r["material_id"],
            sub_channel=r["sub_channel"],
            period=r["date"].strftime("%b.%y"),
            forecast_hl=float(r["Hl_hat_p50"]),
            budget_hl=float(r["target_hl"] or 0),
            gap_hl=float(r["gap_hl"] or 0),
            gap_pct=float(r["gap_pct"] or 0),
            confidence=r["confidence"],
        )
        for r in df.head(limit).iter_rows(named=True)
    ]
