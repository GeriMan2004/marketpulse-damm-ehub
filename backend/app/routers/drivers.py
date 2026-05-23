from fastapi import APIRouter, Query

from app.schemas import Driver

router = APIRouter(prefix="/api", tags=["drivers"])


@router.get("/drivers", response_model=list[Driver])
def get_drivers(
    sku: str = Query(...),
    sub_channel: str = Query(...),
    period: str = Query(...),
    top_k: int = Query(default=3, ge=1, le=10),
) -> list[Driver]:
    """Mock SHAP drivers. Real impl runs TreeExplainer on the p50 LightGBM."""
    drivers = [
        Driver(feature="Promo coverage weeks 47-48", shap_value=-92.4,
               direction="negative",
               explanation="Planned multi-pack promo is shorter than the 2024 equivalent, removing ~92 Hl of expected lift."),
        Driver(feature="Weather forecast", shap_value=-48.1, direction="negative",
               explanation="UK November temperatures forecast 1.8°C below the 5-year average, depressing off-trade beer demand."),
        Driver(feature="Recent trend (3-month rolling)", shap_value=-29.5, direction="negative",
               explanation="3-month rolling sales have softened vs the same window in 2024, contributing ~30 Hl of the gap."),
    ]
    return drivers[:top_k]
