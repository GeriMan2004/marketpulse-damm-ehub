"""Schemas for /api/plays — three signal-grounded plays per SKU × channel."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

PlayKind = Literal["repeat", "event", "gap-closer"]
ActionType = Literal["promo", "brand-focus", "channel-focus", "commercial-effort"]
EffortLevel = Literal["low", "medium", "high"]


class Play(BaseModel):
    """One suggested play, grounded in a specific data source.

    Each play tells the user WHAT to do (`title` + `summary`), WHY it fits
    THIS SKU × channel × period (`why` + `why_source`), and WHICH controls
    to pre-fill into the simulator (`action_type` + the optional fields).

    `expected_gap_closed_pct` is a deterministic estimate so the UI can
    rank cards without round-tripping through the LLM / simulator. The
    user still hits Run in the simulator to see the calibrated number.
    """

    kind: PlayKind
    title: str = Field(..., description="Imperative one-liner, max ~50 chars")
    summary: str = Field(..., description="What this play does, ~120 chars")
    why: str = Field(..., description="The grounding fact in plain English")
    why_source: str = Field(..., description="Which signal/dataset this came from")
    months: list[str] = Field(default_factory=list, description="Pre-fill months e.g. ['Jul.26']")
    action_type: ActionType
    promo_type: str | None = None
    discount_pct: float | None = Field(default=None, ge=0.0, le=50.0)
    effort_level: EffortLevel | None = None
    expected_gap_closed_pct: float | None = Field(default=None, ge=0.0, le=1.2)


class PlaysResponse(BaseModel):
    sku: str
    sub_channel: str
    period: str | None
    gap_hl: float | None
    plays: list[Play]
