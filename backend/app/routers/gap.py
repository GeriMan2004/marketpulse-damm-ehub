from fastapi import APIRouter, Query

from app.schemas import GapItem

router = APIRouter(prefix="/api", tags=["gap"])


@router.get("/gap", response_model=list[GapItem])
def get_gap(
    brand: str | None = Query(default=None),
    sub_channel: str | None = Query(default=None),
    period_from: str | None = Query(default=None, alias="from"),
    period_to: str | None = Query(default=None, alias="to"),
    sort: str = Query(default="gap_pct_asc"),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[GapItem]:
    """Mock gap rows. Real impl joins forecast vs budget snapshots."""
    items = [
        GapItem(sku="EX23SRAN", sub_channel="GROCERY", period="Nov.26",
                forecast_hl=3942, budget_hl=4112, gap_hl=-170, gap_pct=-0.0413,
                confidence="medium"),
        GapItem(sku="EX23SRAN", sub_channel="GROCERY", period="Oct.26",
                forecast_hl=3550, budget_hl=3680, gap_hl=-130, gap_pct=-0.0353,
                confidence="medium"),
        GapItem(sku="K014800", sub_channel="GROCERY", period="Nov.26",
                forecast_hl=920, budget_hl=985, gap_hl=-65, gap_pct=-0.0660,
                confidence="low"),
    ]
    return items[:limit]
