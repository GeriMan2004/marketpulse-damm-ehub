from pydantic import BaseModel


class AnomalyEvent(BaseModel):
    sku: str
    sub_channel: str
    period: str
    actual_hl: float
    expected_hl: float
    z_score: float
    candidate_cause: str           # e.g. "Weather: temp -3.2°C vs typical"
