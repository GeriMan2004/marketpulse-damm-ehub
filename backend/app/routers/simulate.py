from datetime import date

from fastapi import APIRouter

from app.schemas import ForecastPoint, ForecastSeries, SimulationRequest, SimulationResult

router = APIRouter(prefix="/api", tags=["simulate"])


def _series(sku: str, sub: str, base: list[float]) -> ForecastSeries:
    periods = ["Sep.26", "Oct.26", "Nov.26", "Dic.26"]
    return ForecastSeries(
        sku=sku, sub_channel=sub, granularity="month",
        points=[
            ForecastPoint(
                period=periods[i], period_start=date(2026, 9 + i, 1),
                point=v, lo80=v * 0.9, hi80=v * 1.1, lo95=v * 0.85, hi95=v * 1.15,
                is_actual=False,
            ) for i, v in enumerate(base)
        ],
    )


@router.post("/simulate", response_model=SimulationResult)
def simulate(req: SimulationRequest) -> SimulationResult:
    """Mock simulator. Real impl re-runs the LightGBM ensemble with modified exogenous frame."""
    if req.sub_channel != "GROCERY":
        return SimulationResult(
            baseline=_series(req.sku, req.sub_channel, [3812, 3550, 3942, 4180]),
            simulated=_series(req.sku, req.sub_channel, [3812, 3550, 3942, 4180]),
            gap_before_hl=0, gap_after_hl=0, gap_closed_pct=0.0,
            estimated_cost=None,
            notes="Promo simulation is only supported in the GROCERY subchannel for this hackathon.",
        )
    baseline = _series(req.sku, "GROCERY", [3812, 3550, 3942, 4180])
    bump = 1 + (req.discount_pct / 100) * 0.094  # 9.4% lift per 10% discount
    simulated = _series(req.sku, "GROCERY", [v * bump if i >= 2 else v for i, v in enumerate([3812, 3550, 3942, 4180])])
    return SimulationResult(
        baseline=baseline, simulated=simulated,
        gap_before_hl=-170.0, gap_after_hl=-55.0, gap_closed_pct=0.676,
        estimated_cost=12_400.0,
        notes=f"{req.promo_type} promo lift of +9.4% (historical avg) reduces the November shortfall from 4.1% to 1.3% under budget.",
    )
