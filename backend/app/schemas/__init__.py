"""Pydantic schemas — single source of truth for FastAPI + Instructor + frontend TS types."""

from .anomaly import AnomalyEvent
from .chat import ChatMessage, ChatRequest
from .drivers import Driver
from .explain import ExplainViewRequest, ExplainViewSummary
from .forecast import ForecastPoint, ForecastSeries
from .gap import GapItem, KpiSummary
from .meta import MetaResponse
from .promos import PromoROI
from .recommend import RecommendationAction, RecommendationResponse, RecommendationScenario
from .simulate import SimulationRequest, SimulationResult

__all__ = [
    "AnomalyEvent",
    "ChatMessage",
    "ChatRequest",
    "Driver",
    "ExplainViewRequest",
    "ExplainViewSummary",
    "ForecastPoint",
    "ForecastSeries",
    "GapItem",
    "KpiSummary",
    "MetaResponse",
    "PromoROI",
    "RecommendationAction",
    "RecommendationResponse",
    "RecommendationScenario",
    "SimulationRequest",
    "SimulationResult",
]
