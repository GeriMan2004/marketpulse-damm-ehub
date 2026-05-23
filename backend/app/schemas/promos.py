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
