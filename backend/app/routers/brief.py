"""POST /api/brief — generate a Dia-style call brief for a customer meeting.

The frontend already knows which SKUs belong to the customer (via the
fake hash-bucket split on GROCERY in `lib/calls.ts`), so it sends the
precomputed list. The backend just:

  1. Loads the existing news cache, picks the most-recent items relevant
     to the customer / Damm brands.
  2. Calls the LLM (Kimi K2 "deep" profile) to synthesise three prose
     pieces: the framing headline, the push-forward title, and the
     push-forward body — plus a one-line "recommended ask" per SKU.
  3. Returns a fully structured BriefResponse the FE renders verbatim.

If the LLM call fails we fall back to deterministic stubs so the page
still renders something usable — never let the brief 5xx.
"""

from __future__ import annotations

import json
import logging
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services import news as news_svc
from app.services.llm import call_with_fallback
from app.services.plays import build_plays

router = APIRouter(prefix="/api", tags=["brief"])

log = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────
# Schema
# ──────────────────────────────────────────────────────────────────────────


class BriefSkuInput(BaseModel):
    """One at-risk SKU passed in by the frontend."""
    sku: str
    sub_channel: str
    period: str               # "Nov.26" (frontend's display string is fine)
    sku_label: str            # already humanised by FE via meta.skus
    gap_pct: float            # signed, negative = behind plan
    gap_hl: float             # signed
    top_driver: str | None = None  # human-readable, e.g. "promo gap"


class BriefRequest(BaseModel):
    customer: str             # display label, e.g. "Trolley King"
    customer_key: Literal["tesco", "sainsburys", "asda", "morrisons", "on_trade"]
    meeting_weekday: str      # "Wednesday"
    meeting_in_days: int = Field(ge=0, le=30)
    skus: list[BriefSkuInput] # already filtered to this customer's at-risk basket
    # Net picture for the WHOLE basket — `skus` above only carries the
    # actionable losses (worst-5). These let the brief frame the meeting
    # honestly: "you're ahead overall but…" vs "you're behind everywhere".
    wins_count: int = 0
    wins_hl: float = 0.0      # sum of positive gap_hl (always ≥ 0)
    losses_count: int = 0
    losses_hl: float = 0.0    # sum of negative gap_hl (always ≤ 0)


class BriefSkuRow(BaseModel):
    sku_label: str
    sub_channel: str
    period: str
    gap_pct: float
    gap_hl: float
    top_driver: str | None
    recommended_ask: str | None


class BriefNewsItem(BaseModel):
    title: str
    url: str
    source_domain: str
    published_at: str | None


class BriefAgendaItem(BaseModel):
    time: str
    title: str


class BriefResponse(BaseModel):
    customer: str
    meeting_label: str        # "Wednesday in 2 days"
    headline: str             # 1 sentence framing the call
    push_forward_title: str   # the ONE big ask
    push_forward_body: str    # 2 sentence rationale
    top_skus: list[BriefSkuRow]
    market_context: list[BriefNewsItem]
    agenda: list[BriefAgendaItem]
    # Net basket-level numbers so the FE can render "X wins · Y losses ·
    # net £Z" alongside the prose. Mirrors the BriefRequest summary.
    wins_count: int = 0
    losses_count: int = 0
    net_hl: float = 0.0       # wins_hl + losses_hl (negative = net behind)


# ──────────────────────────────────────────────────────────────────────────
# LLM prompt
# ──────────────────────────────────────────────────────────────────────────


_SYSTEM = """You write one-paragraph meeting briefs for a UK Commercial Manager prepping a customer call.

Voice: terse, imperative, no filler. Cite the numbers you're given. Sound like a colleague who's already done the analysis. Never invent promo mechanics or numbers.

Output: STRICT JSON only. No markdown fences.
"""


def _build_user_prompt(req: BriefRequest, net_hl: float, top_play_title: str | None) -> str:
    sku_lines = "\n".join(
        f"- {s.sku_label} ({s.sub_channel}, {s.period}): "
        f"{s.gap_pct * 100:+.0f}% / {s.gap_hl:+.1f}k hL"
        + (f" · driver: {s.top_driver}" if s.top_driver else "")
        for s in req.skus[:5]
    )
    play_line = (
        f"\nGrounded suggestion for the top SKU: {top_play_title}"
        if top_play_title else ""
    )
    # Net framing: tell the LLM the WHOLE picture so it doesn't write
    # "the basket is in trouble" when the customer is actually ahead net,
    # or vice versa.
    net_line = (
        f"Whole basket net: {net_hl:+.1f}k hL  ({req.wins_count} SKUs ahead "
        f"= +{req.wins_hl:.1f}k hL; {req.losses_count} SKUs behind "
        f"= {req.losses_hl:.1f}k hL)."
    )
    return f"""Customer call: {req.customer} — {req.meeting_weekday}, in {req.meeting_in_days} days.

{net_line}

Top {min(5, len(req.skus))} actionable losses to discuss:
{sku_lines}{play_line}

Return STRICT JSON:
{{
  "headline": "ONE sentence (max 20 words) — frame the meeting honestly given the NET picture. If net is positive, acknowledge it before pivoting to the losses.",
  "push_forward_title": "ONE action to push for (max 10 words). Name the SKU and the mechanic.",
  "push_forward_body": "TWO sentences (max 40 words total) — cite the loss-side gap and the buyer concession to ask for."
}}

Be specific. No softeners. No 'consider' or 'discuss' — use imperatives ('pull forward', 'extend', 'push for', 'lock').
"""


# ──────────────────────────────────────────────────────────────────────────
# News selection — keep it simple, most-recent on-topic
# ──────────────────────────────────────────────────────────────────────────


def _news_for_brief(limit: int = 5) -> list[BriefNewsItem]:
    """Top N news articles, most-recent first.

    We don't filter by customer here — the news rail already filters to
    Damm-relevant trade press. Any brand/competitor signal is useful
    context for any customer call.
    """
    articles, _updated = news_svc.list_articles(limit=limit)
    return [
        BriefNewsItem(
            title=a.title,
            url=a.url,
            source_domain=a.source_domain,
            published_at=(a.published_at or a.fetched_at).isoformat()
            if (a.published_at or a.fetched_at) else None,
        )
        for a in articles[:limit]
    ]


# ──────────────────────────────────────────────────────────────────────────
# Endpoint
# ──────────────────────────────────────────────────────────────────────────


@router.post("/brief", response_model=BriefResponse)
def post_brief(req: BriefRequest) -> BriefResponse:
    # NET = wins + losses (losses are stored as negative). If the caller
    # didn't provide the wins side (older FE versions), fall back to the
    # sum of the basket's signed gaps.
    net_hl = req.wins_hl + req.losses_hl
    if req.wins_count == 0 and req.losses_count == 0:
        net_hl = sum(s.gap_hl for s in req.skus)

    # Per-SKU grounded play — used both as the recommended_ask on the row
    # AND as a hint to the LLM for the push-forward action so the prose
    # references the same play the user sees on the decision page.
    sku_plays: list[str | None] = []
    for s in req.skus[:5]:
        try:
            plays = build_plays(s.sku, s.sub_channel, s.period)
            if not plays:
                sku_plays.append(None)
                continue
            # Highest expected gap-closed wins; ties broken by play order.
            best = max(plays, key=lambda p: p.expected_gap_closed_pct or 0)
            sku_plays.append(best.title)
        except Exception:
            sku_plays.append(None)
    top_play_title = sku_plays[0] if sku_plays else None

    # LLM prose pieces — fallback to deterministic stubs on any failure.
    prose: dict = {}
    try:
        resp = call_with_fallback(
            "deep",
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": _build_user_prompt(req, net_hl, top_play_title)},
            ],
            max_tokens=400,
        )
        content = (resp.choices[0].message.content or "").strip()
        # Strip ```json fences if the model adds them despite instructions
        if content.startswith("```"):
            content = content.split("```", 2)[1]
            if content.startswith("json"):
                content = content[4:].strip()
        prose = json.loads(content)
    except Exception as e:
        log.warning("Brief LLM call failed (%s); using fallback prose.", e)
        prose = {}

    net_direction = "ahead" if net_hl >= 0 else "behind"
    headline = prose.get("headline") or (
        f"{req.customer} {req.meeting_weekday}: net {net_hl:+.1f}k hL {net_direction} "
        f"({req.wins_count} wins, {req.losses_count} losses) — lead with the losses."
    )
    push_title = prose.get("push_forward_title") or (
        top_play_title or f"Walk the buyer through the top {min(3, len(req.skus))} SKUs"
    )
    push_body = prose.get("push_forward_body") or (
        f"Net basket sits {net_hl:+.1f}k hL over the next 9 months. "
        "Lead with the biggest loss-side gap and lock a concession on promo timing or listing depth."
    )

    # Per-SKU recommended_ask = grounded play title from /api/plays. Falls
    # back to the driver-anchored phrase only when no play can be grounded
    # (no historical promo / event / gap context for that SKU).
    top_n = req.skus[:5]
    top_skus = [
        BriefSkuRow(
            sku_label=s.sku_label,
            sub_channel=s.sub_channel,
            period=s.period,
            gap_pct=s.gap_pct,
            gap_hl=s.gap_hl,
            top_driver=s.top_driver,
            recommended_ask=sku_plays[i] or (
                f"Address {s.top_driver}"
                if s.top_driver else "Open with the gap, ask for a concession"
            ),
        )
        for i, s in enumerate(top_n)
    ]

    # Stubbed agenda — real calendar integration is out of scope for the
    # hackathon. Title slot 2 reflects the LLM's push-forward action so the
    # agenda links back to the headline ask.
    agenda = [
        BriefAgendaItem(time="9:00am", title="Buyer intro & quarterly review"),
        BriefAgendaItem(time="10:00am", title=push_title[:80]),
        BriefAgendaItem(time="11:00am", title="Q1 pricing commitment"),
        BriefAgendaItem(time="11:30am", title="New listings & trial pack discussion"),
    ]

    return BriefResponse(
        customer=req.customer,
        meeting_label=(
            "Today"
            if req.meeting_in_days == 0
            else "Tomorrow"
            if req.meeting_in_days == 1
            else f"{req.meeting_weekday} in {req.meeting_in_days} days"
        ),
        headline=headline,
        push_forward_title=push_title,
        push_forward_body=push_body,
        top_skus=top_skus,
        market_context=_news_for_brief(limit=5),
        agenda=agenda,
        wins_count=req.wins_count,
        losses_count=req.losses_count,
        net_hl=net_hl,
    )
