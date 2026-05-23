from fastapi import APIRouter, Query

from app.schemas import PromoROI

router = APIRouter(prefix="/api", tags=["promos"])


@router.get("/promos/roi", response_model=list[PromoROI])
def get_promo_roi(
    sub_channel: str | None = Query(default=None),
    top_k: int = Query(default=10, ge=1, le=50),
) -> list[PromoROI]:
    """Mock ROI ranking. Real impl reads snapshots/promo_roi.parquet (CausalImpact)."""
    items = [
        PromoROI(promo_type="multi-pack", sub_channel="GROCERY",
                 avg_lift_pct=0.094, avg_lift_hl=352.0,
                 estimated_cost=12_400, roi=1.74, n_observations=6, confidence="high"),
        PromoROI(promo_type="price-cut", sub_channel="GROCERY",
                 avg_lift_pct=0.071, avg_lift_hl=268.0,
                 estimated_cost=9_800, roi=1.31, n_observations=5, confidence="medium"),
        PromoROI(promo_type="feature", sub_channel="GROCERY",
                 avg_lift_pct=0.039, avg_lift_hl=147.0,
                 estimated_cost=4_200, roi=1.68, n_observations=4, confidence="medium"),
    ]
    if sub_channel:
        items = [i for i in items if i.sub_channel == sub_channel]
    return items[:top_k]
