from fastapi import APIRouter

from app.schemas import ExplainViewRequest, ExplainViewSummary

router = APIRouter(prefix="/api", tags=["explain-view"])


@router.post("/explain-view", response_model=ExplainViewSummary)
def explain_view(req: ExplainViewRequest) -> ExplainViewSummary:
    """Mock summary. Real impl uses Llama-3.3 via Groq on the `fast` profile."""
    return ExplainViewSummary(
        headline=f"View summary for {req.page}",
        bullets=[
            "Estrella Damm in off-trade grocery is projected 4.1% below budget for November.",
            "The biggest driver is reduced promo coverage in the second half of the month.",
            "Extending the planned multi-pack promo would close ~68% of the gap.",
        ],
        suggested_next_action="Open the simulator and try extending the multi-pack promo to weeks 47-48.",
    )
