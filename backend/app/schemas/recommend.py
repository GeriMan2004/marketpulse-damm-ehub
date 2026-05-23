from typing import Literal

from pydantic import BaseModel, Field


class RecommendationAction(BaseModel):
    action: str                                    # short imperative
    target_sku: str
    target_sub_channel: str
    target_months: list[str]
    expected_lift_hl: float
    expected_gap_closed_pct: float
    estimated_cost: float | None = None
    confidence: Literal["low", "medium", "high"] = "medium"
    evidence: list[str] = Field(default_factory=list, max_length=3)


class RecommendationScenario(BaseModel):
    label: Literal["conservative", "balanced", "aggressive"]
    headline: str
    actions: list[RecommendationAction] = Field(default_factory=list)
    total_expected_gap_closed_pct: float
    risk_notes: str


class RecommendationResponse(BaseModel):
    sku: str
    sub_channel: str
    period: str
    current_gap_hl: float
    current_gap_pct: float
    scenarios: list[RecommendationScenario] = Field(min_length=3, max_length=3)
