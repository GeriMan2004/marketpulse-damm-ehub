from typing import Literal

from pydantic import BaseModel


class PromoROI(BaseModel):
    promo_type: str                                # e.g. "multi-pack"
    sub_channel: str
    avg_lift_pct: float                            # from CausalImpact
    avg_lift_hl: float
    estimated_cost: float | None = None
    roi: float | None = None                       # null if cost unknown
    n_observations: int
    confidence: Literal["low", "medium", "high"] = "low"
    # NEW: trailing per-month lift signal for this promo_type (oldest→newest,
    # up to 12 points). Derived from discount depth on historical promo events
    # in promos.parquet, weighted by event count. Empty when there's no
    # historical signal.
    lift_history: list[float] = []


class PromoBudgetFlowItem(BaseModel):
    promo_type: str
    usage_pct: float
    event_count: int
    avg_lift_pct: float | None = None
    avg_lift_hl: float | None = None
    confidence: Literal["low", "medium", "high"] = "low"


class PromoAffectedProduct(BaseModel):
    material_id: str
    brand: str
    label: str
    forecast_hl: float | None = None
    target_hl: float | None = None
    gap_pct: float | None = None
    estimated_lift_pct: float | None = None


class PromoBudgetPreview(BaseModel):
    promo_type: str
    headline: str
    explanation: str
    affected_products: list[PromoAffectedProduct]


class PromoBudgetFlow(BaseModel):
    month: str
    available_months: list[str] = []
    total_promo_events: int
    dominant_promo_type: str | None = None
    flow: list[PromoBudgetFlowItem]
    preview: PromoBudgetPreview | None = None
