"""What-if promo simulator.

Maps a (months, discount, promo_type) request to a lifted forecast plus
the £ economics of running that promo. Used by the Decision page's
Simulator view.

Design notes (rewrite over the previous naive linear version)
--------------------------------------------------------------

**Lift curve — diminishing returns.** Real promo response saturates:
doubling the discount doesn't double the lift. We use

    applied_lift = historical_lift_for(promo_type) × (1 − exp(−discount / SCALE))

with SCALE = 15. At 15% discount you get ~63% of the historical mean, at
30% you get ~86%, at 45% ~95%. Asymptotes to the historical mean. Beats
the previous `discount/10 × historical` formula, which extrapolated wildly
beyond the observed data range when discount > 10%.

**Cost — real GBP, not a magic number.** We compute the discount give-away as:

    cost = simulated_hl × (discount_pct / 100) × gross_price_per_hl

i.e. "the revenue we forgo by pricing X% lower across the lifted volume".
The previous version used a hardcoded `12,400 × months × discount/10`
which had no relationship to the SKU's actual unit value.

**Incremental £ — what the user actually cares about.** Net impact is

    lift_gbp = (simulated_hl − baseline_hl) × gross_price_per_hl
    net_gbp  = lift_gbp − cost

A negative `net_gbp` means the promo is being subsidised faster than it
generates incremental revenue — useful trigger for the UI to warn.

**All sub_channels supported.** Previous version hard-blocked anything
other than GROCERY. We now fall back to the brand-wide historical lift
when no channel-specific signal exists; promo cost still computes since
gross price is per (sku × sub_channel).
"""

from __future__ import annotations

import math
from datetime import date as date_t
from pathlib import Path

import polars as pl

from app.schemas import (
    ForecastPoint, ForecastSeries, SimulationRequest, SimulationResult,
)
from app.services.pricing import gross_price_per_hl

ROOT = Path(__file__).resolve().parents[3]
FORECAST = ROOT / "app" / "data" / "snapshots" / "forecast.parquet"
TARGETS = ROOT / "app" / "data" / "snapshots" / "targets.parquet"
PROMO_ROI = ROOT / "app" / "data" / "snapshots" / "promo_roi.parquet"

# Diminishing-returns scale (see module docstring).
LIFT_SCALE = 15.0

# Fallback historical mean lift per promo type when promo_roi is missing.
# Eyeballed from typical UK off-trade beer promo response; replace once
# ROI snapshots ship a per-channel mean.
FALLBACK_LIFT: dict[str, float] = {
    "multi-buy": 0.25,
    "price-cut": 0.18,
    "rollback":  0.16,
    "clearance": 0.12,
    "listing":   0.08,
}


def _parse_period(s: str) -> date_t:
    """Accept "Nov.26", "Nov 26", or "2026-11" — return month-start date."""
    EN = {"Jan":1,"Feb":2,"Mar":3,"Apr":4,"May":5,"Jun":6,
          "Jul":7,"Aug":8,"Sep":9,"Oct":10,"Nov":11,"Dec":12}
    s = s.strip()
    if "-" in s and s.split("-")[0].isdigit():
        y, m = s.split("-")[:2]
        return date_t(int(y), int(m), 1)
    sep = "." if "." in s else " "
    m, y = s.split(sep)
    yi = int(y)
    if yi < 100:
        yi += 2000
    return date_t(yi, EN[m[:3].title()], 1)


def _historical_lift(promo_type: str) -> float:
    """Per-promo-type average lift fraction, sourced from promo_roi snapshot
    when available, otherwise the eyeballed fallback."""
    if PROMO_ROI.is_file():
        roi = pl.read_parquet(PROMO_ROI).filter(pl.col("promo_type") == promo_type)
        if len(roi):
            mean = float(roi["avg_lift_pct"].mean())
            # promo_roi stores lift_pct already as a fraction (e.g. 0.094).
            return max(0.0, mean)
    return FALLBACK_LIFT.get(promo_type, 0.10)


def _applied_lift(promo_type: str, discount_pct: float) -> float:
    """Saturating lift curve. Returns the fraction applied (e.g. 0.18)."""
    if discount_pct <= 0:
        return 0.0
    base = _historical_lift(promo_type)
    return base * (1.0 - math.exp(-discount_pct / LIFT_SCALE))


def _empty_result(req: SimulationRequest, notes: str) -> SimulationResult:
    return SimulationResult(
        baseline=ForecastSeries(sku=req.sku, sub_channel=req.sub_channel, points=[]),
        simulated=ForecastSeries(sku=req.sku, sub_channel=req.sub_channel, points=[]),
        gap_before_hl=0.0,
        gap_after_hl=0.0,
        gap_closed_pct=0.0,
        lift_hl=0.0,
        lift_gbp=None,
        estimated_cost=None,
        net_gbp=None,
        gbp_per_hl=None,
        applied_lift_pct=0.0,
        notes=notes,
    )


def simulate(req: SimulationRequest) -> SimulationResult:
    if not FORECAST.is_file():
        return _empty_result(req, "forecast.parquet missing — run STEPs 1-6 first.")

    target_dates = [_parse_period(p) for p in req.months]
    if not target_dates:
        return _empty_result(req, "No months selected.")

    fc = pl.read_parquet(FORECAST)
    base = fc.filter(
        (pl.col("material_id") == req.sku)
        & (pl.col("sub_channel") == req.sub_channel)
        & (pl.col("date").is_in(target_dates))
    ).sort("date")

    if len(base) == 0:
        return _empty_result(
            req,
            f"No forecast available for {req.sku} × {req.sub_channel} in those months.",
        )

    applied_lift = _applied_lift(req.promo_type, req.discount_pct)

    # Price per hL — used for both lift_gbp and cost. Try the most-specific
    # slice first (sku × channel), then degrade gracefully.
    rate, _ = gross_price_per_hl(sku=req.sku, sub_channel=req.sub_channel)
    if rate is None:
        rate, _ = gross_price_per_hl(sku=req.sku)

    points_baseline: list[ForecastPoint] = []
    points_simulated: list[ForecastPoint] = []
    for r in base.iter_rows(named=True):
        point_hl = float(r["Hl_hat_p50"])
        lo = float(r.get("Hl_hat_p10_cal", r.get("Hl_hat_p10")))
        hi = float(r.get("Hl_hat_p90_cal", r.get("Hl_hat_p90")))
        period = r["date"].strftime("%b.%y")
        points_baseline.append(ForecastPoint(
            period=period, period_start=r["date"],
            point=point_hl, lo80=lo, hi80=hi, lo95=lo*0.85, hi95=hi*1.15,
        ))
        sim_hl = point_hl * (1.0 + applied_lift)
        # Don't scale the confidence band by the lift — it makes the simulated
        # band look implausibly wide. Keep the same absolute uncertainty as
        # the baseline; what's changing is the central estimate.
        points_simulated.append(ForecastPoint(
            period=period, period_start=r["date"],
            point=sim_hl, lo80=lo, hi80=hi, lo95=lo*0.85, hi95=hi*1.15,
        ))

    # Gap vs the *combined* target across the selected months.
    target_hl = 0.0
    if TARGETS.is_file():
        tgt = pl.read_parquet(TARGETS).filter(
            (pl.col("material_id") == req.sku)
            & (pl.col("sub_channel") == req.sub_channel)
            & (pl.col("date").is_in(target_dates))
        )
        target_hl = float(tgt["target_hl"].sum()) if len(tgt) else 0.0

    baseline_hl = sum(p.point for p in points_baseline)
    simulated_hl = sum(p.point for p in points_simulated)
    lift_hl = simulated_hl - baseline_hl
    gap_before = baseline_hl - target_hl
    gap_after = simulated_hl - target_hl
    gap_closed_pct = (
        (gap_after - gap_before) / abs(gap_before) if gap_before != 0 else 0.0
    )

    lift_gbp: float | None = None
    cost_gbp: float | None = None
    net_gbp: float | None = None
    if rate is not None:
        lift_gbp = lift_hl * rate
        # Cost = discount give-away on the (lifted) volume actually sold.
        cost_gbp = simulated_hl * (req.discount_pct / 100.0) * rate
        net_gbp = lift_gbp - cost_gbp

    notes_parts = [
        f"{req.promo_type} @ {req.discount_pct:.0f}% across "
        f"{len(req.months)} month{'s' if len(req.months) != 1 else ''}",
        f"applied lift {applied_lift * 100:.1f}% (diminishing-returns curve)",
    ]
    if rate is not None:
        notes_parts.append(f"unit price proxy £{rate:.0f}/hL")
    notes = " · ".join(notes_parts)

    return SimulationResult(
        baseline=ForecastSeries(
            sku=req.sku, sub_channel=req.sub_channel,
            granularity="month", points=points_baseline,
        ),
        simulated=ForecastSeries(
            sku=req.sku, sub_channel=req.sub_channel,
            granularity="month", points=points_simulated,
        ),
        gap_before_hl=gap_before,
        gap_after_hl=gap_after,
        gap_closed_pct=gap_closed_pct,
        lift_hl=lift_hl,
        lift_gbp=lift_gbp,
        estimated_cost=cost_gbp,
        net_gbp=net_gbp,
        gbp_per_hl=rate,
        applied_lift_pct=applied_lift,
        notes=notes,
    )
