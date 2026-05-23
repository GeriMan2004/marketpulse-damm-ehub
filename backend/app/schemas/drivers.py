from typing import Literal

from pydantic import BaseModel


class Driver(BaseModel):
    feature: str                                # "Promo coverage weeks 47-48"
    shap_value: float                           # signed contribution in Hl
    direction: Literal["positive", "negative"]
    explanation: str                            # one-sentence natural-language explanation
