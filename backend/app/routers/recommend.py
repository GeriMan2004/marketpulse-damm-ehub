from fastapi import APIRouter

from app.schemas import (
    RecommendationAction,
    RecommendationResponse,
    RecommendationScenario,
)
from pydantic import BaseModel


class RecommendRequest(BaseModel):
    sku: str
    sub_channel: str
    period: str


router = APIRouter(prefix="/api", tags=["recommend"])


@router.post("/recommend", response_model=RecommendationResponse)
def recommend(req: RecommendRequest) -> RecommendationResponse:
    """Mock 3-scenario response. Real impl uses Kimi-K2-Instruct via Instructor on the `deep` profile."""
    return RecommendationResponse(
        sku=req.sku, sub_channel=req.sub_channel, period=req.period,
        current_gap_hl=-170.0, current_gap_pct=-0.0413,
        scenarios=[
            RecommendationScenario(
                label="conservative",
                headline="Extend the existing multi-pack promo into weeks 47-48",
                actions=[
                    RecommendationAction(
                        action="Extend multi-pack 4x330ml to weeks 47-48",
                        target_sku=req.sku, target_sub_channel=req.sub_channel,
                        target_months=["Nov.26"],
                        expected_lift_hl=115.0, expected_gap_closed_pct=0.68,
                        estimated_cost=12_400.0, confidence="high",
                        evidence=["Historical lift +9.4% on identical promo (n=6)",
                                  "Already in current trade plan — execution risk minimal"],
                    ),
                ],
                total_expected_gap_closed_pct=0.68,
                risk_notes="Low risk — extension of an existing planned promo.",
            ),
            RecommendationScenario(
                label="balanced",
                headline="Multi-pack extension + 12-pack secondary bundle in cold-weather regions",
                actions=[
                    RecommendationAction(
                        action="Extend multi-pack 4x330ml weeks 47-48",
                        target_sku=req.sku, target_sub_channel=req.sub_channel,
                        target_months=["Nov.26"], expected_lift_hl=115.0,
                        expected_gap_closed_pct=0.68, estimated_cost=12_400.0,
                        confidence="high", evidence=["Historical lift +9.4% (n=6)"],
                    ),
                    RecommendationAction(
                        action="Add 12-pack bundle promo in northern regions",
                        target_sku=req.sku, target_sub_channel=req.sub_channel,
                        target_months=["Nov.26"], expected_lift_hl=42.0,
                        expected_gap_closed_pct=0.25, estimated_cost=5_200.0,
                        confidence="medium",
                        evidence=["Weather forecast shows -1.8°C anomaly in N. England",
                                  "Larger pack sizes outperformed in winter 2024"],
                    ),
                ],
                total_expected_gap_closed_pct=0.93,
                risk_notes="Medium risk — assumes warehouse capacity for 12-pack secondary listing.",
            ),
            RecommendationScenario(
                label="aggressive",
                headline="Combine both plus a digital media push (over-budget by ~3%)",
                actions=[
                    RecommendationAction(
                        action="Extend multi-pack + 12-pack bundle + 2% digital media reallocation",
                        target_sku=req.sku, target_sub_channel=req.sub_channel,
                        target_months=["Nov.26"], expected_lift_hl=215.0,
                        expected_gap_closed_pct=1.03, estimated_cost=22_900.0,
                        confidence="medium",
                        evidence=["Combined historical effect modeled in simulator",
                                  "Digital media has 1.4x ROI vs in-store-only"],
                    ),
                ],
                total_expected_gap_closed_pct=1.03,
                risk_notes="Higher cost; commits 2% of December budget upstream.",
            ),
        ],
    )
