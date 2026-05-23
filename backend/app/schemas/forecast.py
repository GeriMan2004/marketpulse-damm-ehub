from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class ForecastPoint(BaseModel):
    period: str                      # "Nov.26"
    period_start: date
    point: float                     # Hl
    lo80: float
    hi80: float
    lo95: float
    hi95: float
    is_actual: bool = False          # true for historical months


class ForecastSeries(BaseModel):
    sku: str
    sub_channel: str
    granularity: Literal["month", "week"] = "month"
    points: list[ForecastPoint] = Field(default_factory=list)
