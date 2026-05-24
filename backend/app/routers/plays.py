"""GET /api/plays — three signal-grounded plays per SKU × sub_channel.

Replaces the old `/api/recommend` flow for the decision page: instead of
three LLM-generated risk frames (Conservative / Balanced / Aggressive),
we return three plays each anchored on a different data source the user
can already see elsewhere on the page (historical promo ROI, upcoming
calendar events, current forecast-vs-target gap).

Deterministic. No LLM dependency. See services/plays.py for the per-play
grounding logic.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.schemas import PlaysResponse
from app.services.plays import _gap_context, build_plays

router = APIRouter(prefix="/api", tags=["plays"])


@router.get("/plays", response_model=PlaysResponse)
def get_plays(
    sku: str = Query(...),
    sub_channel: str = Query(...),
    period: str | None = Query(default=None),
) -> PlaysResponse:
    plays = build_plays(sku, sub_channel, period)
    ctx = _gap_context(sku, sub_channel, period)
    return PlaysResponse(
        sku=sku,
        sub_channel=sub_channel,
        period=period,
        gap_hl=ctx.get("gap_hl") if ctx else None,
        plays=plays,
    )
