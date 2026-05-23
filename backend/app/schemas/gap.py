from typing import Literal

from pydantic import BaseModel


class GapItem(BaseModel):
    sku: str
    sub_channel: str
    period: str                      # "Nov.26"
    forecast_hl: float
    budget_hl: float
    gap_hl: float                    # forecast - budget
    gap_pct: float                   # gap_hl / budget_hl
    confidence: Literal["low", "medium", "high"] = "medium"


class KpiSummary(BaseModel):
    total_forecast_hl: float
    total_budget_hl: float
    gap_hl: float
    gap_pct: float
    on_track_skus: int
    off_track_skus: int
    period_range: tuple[str, str]    # e.g. ("Sep.26", "Dec.26")
