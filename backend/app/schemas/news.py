"""Pydantic shapes for the Market Pulse news rail.

Mirrors `web/src/types/news.ts` exactly — keep both in sync. Once the
backend ships, the frontend regenerates openapi-fetch types and the
interim TS shape gets replaced by the generated one.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class NewsArticle(BaseModel):
    """A single trade-press article surfaced by Tavily, tagged for context."""

    id: str = Field(description="SHA1 of the article URL — used as the dedup key.")
    url: str
    title: str
    summary: str = Field(description="Tavily's snippet, ~200 chars.")
    source_domain: str

    published_at: Optional[datetime] = Field(
        default=None,
        description="When Tavily reported the article was published. May be null.",
    )
    fetched_at: datetime = Field(description="When we last refreshed this row.")

    brand_tags: List[str] = Field(default_factory=list)
    channel_tags: List[str] = Field(default_factory=list)
    event_tags: List[str] = Field(default_factory=list)

    relevance_score: float = Field(
        default=0.0,
        description="Tavily's 0..1 relevance score from the original query.",
    )


class NewsResponse(BaseModel):
    """What GET /api/news returns."""

    articles: List[NewsArticle]
    updated_at: Optional[datetime] = Field(
        default=None,
        description="Latest refresh timestamp; null if cache is empty.",
    )


class RefreshResult(BaseModel):
    """What POST /api/admin/refresh-news returns."""

    fetched: int = Field(description="Total articles returned by Tavily across all queries.")
    new_articles: int = Field(description="Articles that weren't already in the cache.")
    cache_size: int = Field(description="Cache size after the refresh + purge.")
    updated_at: datetime
    error: Optional[str] = Field(
        default=None,
        description="Non-null when the refresh ran into a recoverable error (e.g. missing key, Tavily 5xx). The cache is preserved in those cases.",
    )
