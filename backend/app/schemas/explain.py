from typing import Any, Literal

from pydantic import BaseModel, Field


PageName = Literal[
    "overview", "forecast", "drivers", "promos",
    "simulator", "recommendations", "chat",
]


class ExplainViewRequest(BaseModel):
    page: PageName
    filters: dict[str, Any]
    visible_state: dict[str, Any]


class ExplainViewSummary(BaseModel):
    headline: str
    bullets: list[str] = Field(min_length=3, max_length=3)
    suggested_next_action: str | None = None
