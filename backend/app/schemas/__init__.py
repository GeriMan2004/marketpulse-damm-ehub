"""Pydantic schemas — single source of truth for FastAPI + frontend TS types."""

from .aggregates import BrandRollup, Pulse, SubChannelRollup, WorstSlice
from .drivers import Driver
from .explain import ExplainViewRequest, ExplainViewSummary
from .external import (
    ExternalSignals,
    ExternalSignalsTimeline,
    PeriodSignals,
    RetailSignal,
    SearchSignal,
    WeatherSignal,
)
from .forecast import CalendarEvent, ForecastPoint, ForecastSeries, PromoWindow
from .gap import GapItem
from .meta import MetaResponse
from .plays import Play, PlaysResponse
from .pricing import GrossPriceRate
from .promos import (
    PromoAffectedProduct,
    PromoBudgetFlow,
    PromoBudgetFlowItem,
    PromoBudgetPreview,
    PromoROI,
)
from .simulate import SimulationRequest, SimulationResult

__all__ = [
    "BrandRollup",
    "CalendarEvent",
    "Driver",
    "ExplainViewRequest",
    "ExplainViewSummary",
    "ExternalSignals",
    "ExternalSignalsTimeline",
    "PeriodSignals",
    "ForecastPoint",
    "ForecastSeries",
    "PromoWindow",
    "GapItem",
    "GrossPriceRate",
    "MetaResponse",
    "Play",
    "PlaysResponse",
    "PromoAffectedProduct",
    "PromoBudgetFlow",
    "PromoBudgetFlowItem",
    "PromoBudgetPreview",
    "PromoROI",
    "Pulse",
    "RetailSignal",
    "SearchSignal",
    "SimulationRequest",
    "SimulationResult",
    "SubChannelRollup",
    "WeatherSignal",
    "WorstSlice",
]
