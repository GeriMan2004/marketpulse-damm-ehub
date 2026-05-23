from datetime import date

from fastapi import APIRouter, Query

from app.schemas import ForecastPoint, ForecastSeries

router = APIRouter(prefix="/api", tags=["forecast"])


@router.get("/forecast", response_model=ForecastSeries)
def get_forecast(
    sku: str = Query(...),
    sub_channel: str = Query(...),
    granularity: str = Query(default="month", pattern="^(month|week)$"),
    horizon: int = Query(default=9, ge=1, le=24),
) -> ForecastSeries:
    """Mock forecast. Real impl reads from snapshots/forecast.parquet."""
    points = [
        ForecastPoint(
            period=p, period_start=date(2026, i + 4, 1),
            point=v, lo80=v * 0.9, hi80=v * 1.1, lo95=v * 0.85, hi95=v * 1.15,
            is_actual=False,
        )
        for i, (p, v) in enumerate([
            ("Abr.26", 3800), ("May.26", 3200), ("Jun.26", 3100),
            ("Jul.26", 3500), ("Ago.26", 3300), ("Sep.26", 3812),
            ("Oct.26", 3550), ("Nov.26", 3942), ("Dic.26", 4180),
        ][:horizon])
    ]
    return ForecastSeries(sku=sku, sub_channel=sub_channel, granularity=granularity, points=points)
