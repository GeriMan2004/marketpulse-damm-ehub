from typing import Literal

from pydantic import BaseModel, Field

from .forecast import ForecastSeries


class SimulationRequest(BaseModel):
    sku: str
    sub_channel: str
    months: list[str]                              # e.g. ["Nov.26", "Dec.26"]
    discount_pct: float = Field(ge=0, le=100)
    promo_type: Literal[
        "multi-buy", "price-cut", "rollback", "clearance", "listing"
    ] = "multi-buy"


class SimulationResult(BaseModel):
    baseline: ForecastSeries
    simulated: ForecastSeries
    gap_before_hl: float
    gap_after_hl: float
    gap_closed_pct: float
    # Volume uplift across the selected months (simulated_hl - baseline_hl).
    lift_hl: float = 0.0
    # £ uplift = incremental Hl × gross price per hL for this SKU × channel.
    lift_gbp: float | None = None
    # £ given away through the discount = simulated_hl × discount_pct × price.
    estimated_cost: float | None = None
    # Net £ impact = lift_gbp − estimated_cost. Positive = ROI, negative = subsidy.
    net_gbp: float | None = None
    # Per-month gross price used for the £ conversion, surfaced for UI disclosure.
    gbp_per_hl: float | None = None
    # Lift multiplier actually applied (0.0-0.4ish), computed from the
    # diminishing-returns curve, not the linear scaling.
    applied_lift_pct: float = 0.0
    notes: str
