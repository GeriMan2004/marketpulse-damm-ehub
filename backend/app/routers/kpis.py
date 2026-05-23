from fastapi import APIRouter, Query

from app.schemas import KpiSummary

router = APIRouter(prefix="/api", tags=["kpis"])


@router.get("/kpis", response_model=KpiSummary)
def get_kpis(
    brand: str | None = Query(default=None),
    sub_channel: str | None = Query(default=None),
    period_from: str | None = Query(default=None, alias="from"),
    period_to: str | None = Query(default=None, alias="to"),
) -> KpiSummary:
    # Mock until forecast service is wired
    return KpiSummary(
        total_forecast_hl=42_180,
        total_budget_hl=43_950,
        gap_hl=-1_770,
        gap_pct=-0.0403,
        on_track_skus=24,
        off_track_skus=6,
        period_range=(period_from or "Sep.26", period_to or "Dec.26"),
    )
