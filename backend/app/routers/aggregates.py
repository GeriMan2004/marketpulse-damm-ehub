"""GET /api/forecast/timeline    — aggregate monthly forecast for the main chart
GET /api/forecast/by-sub-channel — per sub_channel breakdown for the bar chart

These are Dub-analytics-style "give me one aggregated array" endpoints
that power the Overview page's main time-series chart and breakdown.

Filters: brand, sub_channel — same URL contract as the rest of the API.
"""

from functools import lru_cache
from pathlib import Path

import polars as pl
from fastapi import APIRouter, HTTPException, Query

from app.services.anonymize import sub_channel_label

router = APIRouter(prefix="/api", tags=["aggregates"])

FORECAST = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "forecast.parquet"
TARGETS  = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "targets.parquet"
WIDE     = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "wide_monthly.parquet"


@lru_cache(maxsize=1)
def _frames() -> tuple[pl.DataFrame, pl.DataFrame, pl.DataFrame]:
    if not FORECAST.is_file() or not TARGETS.is_file():
        raise HTTPException(503, "snapshots missing — run make train")
    return pl.read_parquet(FORECAST), pl.read_parquet(TARGETS), pl.read_parquet(WIDE)


def _filter(fc: pl.DataFrame, tg: pl.DataFrame, brand: str | None, sub_channel: str | None):
    if brand:
        fc = fc.filter(pl.col("brand") == brand)
    if sub_channel:
        fc = fc.filter(pl.col("sub_channel") == sub_channel)
    keys = fc.select(["material_id", "sub_channel", "date"]).unique()
    tg = tg.join(keys, on=["material_id", "sub_channel", "date"], how="inner")
    return fc, tg


@router.get("/forecast/timeline")
def forecast_timeline(
    brand: str | None = Query(default=None),
    sub_channel: str | None = Query(default=None),
):
    """Monthly aggregated forecast + target for the main Overview chart.

    Returns:
      [{period, period_start, point, lo80, hi80, target}, ...]
      one row per month, sorted chronologically.
    """
    fc, tg, _ = _frames()
    fc, tg = _filter(fc, tg, brand, sub_channel)
    if len(fc) == 0:
        return []

    fc_agg = (
        fc.group_by("date")
        .agg(
            point=pl.col("Hl_hat_p50").sum(),
            lo80=pl.col("Hl_hat_p10_cal").sum() if "Hl_hat_p10_cal" in fc.columns else pl.col("Hl_hat_p10").sum(),
            hi80=pl.col("Hl_hat_p90_cal").sum() if "Hl_hat_p90_cal" in fc.columns else pl.col("Hl_hat_p90").sum(),
        )
    )
    tg_agg = tg.group_by("date").agg(target=pl.col("target_hl").sum())
    merged = fc_agg.join(tg_agg, on="date", how="left").sort("date")

    return [
        {
            "period": r["date"].strftime("%b.%y"),
            "period_start": r["date"].isoformat(),
            "point": float(r["point"]),
            "lo80": float(r["lo80"]),
            "hi80": float(r["hi80"]),
            "target": float(r["target"]) if r["target"] is not None else None,
        }
        for r in merged.iter_rows(named=True)
    ]


@router.get("/forecast/by-sub-channel")
def forecast_by_sub_channel(
    brand: str | None = Query(default=None),
):
    """Aggregated forecast + target per sub_channel for the breakdown bar chart.

    Returns:
      [{name, code, forecast, target, gap_pct}, ...]
    """
    fc, tg, _ = _frames()
    if brand:
        fc = fc.filter(pl.col("brand") == brand)
    keys = fc.select(["material_id", "sub_channel", "date"]).unique()
    tg = tg.join(keys, on=["material_id", "sub_channel", "date"], how="inner")

    fc_by = (
        fc.group_by("sub_channel")
        .agg(forecast=pl.col("Hl_hat_p50").sum())
    )
    tg_by = tg.group_by("sub_channel").agg(target=pl.col("target_hl").sum())
    merged = (
        fc_by.join(tg_by, on="sub_channel", how="left")
        .with_columns(
            target=pl.col("target").fill_null(0.0),
            gap_pct=((pl.col("forecast") - pl.col("target").fill_null(0.0)) / pl.col("target").clip(lower_bound=1)).fill_null(0.0),
        )
        .sort("forecast", descending=True)
    )

    return [
        {
            "name": sub_channel_label(r["sub_channel"]),
            "code": r["sub_channel"],
            "forecast": float(r["forecast"]),
            "target": float(r["target"]),
            "gap_pct": float(r["gap_pct"]),
        }
        for r in merged.iter_rows(named=True)
    ]
