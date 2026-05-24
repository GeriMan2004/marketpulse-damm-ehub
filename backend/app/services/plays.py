"""Three signal-grounded plays per SKU × sub_channel × period.

Each play is anchored to a DIFFERENT data source so the user is choosing
a *type of bet*, not a risk dial:

  · repeat      — sourced from snapshots/promo_roi.parquet. Picks the best
                  historical promo for this SKU's brand × sub_channel and
                  proposes it again for the target month.
  · event       — sourced from services/calendar.py. Picks the closest
                  high-importance upcoming event and proposes a brand push
                  in the run-up months.
  · gap-closer  — deterministic: sizes a promo discount that, given the
                  brand's historical multi-buy lift, would close the gap
                  for the target month. Reads forecast + targets snapshots.

If a play can't be grounded (e.g. no historical promos for the brand, no
upcoming events in the horizon), it is silently omitted. We'd rather show
two cards than fill a third with hand-waving copy.
"""

from __future__ import annotations

from datetime import date
from functools import lru_cache
from pathlib import Path

import polars as pl

from app.schemas.plays import Play
from app.services.calendar import build_events

SNAPSHOTS = Path(__file__).resolve().parents[1] / "data" / "snapshots"

# Per-month boost the simulator already applies for high-importance events.
# Mirrored here so the gap-closer's discount sizing accounts for it (we
# don't want to over-size when the event already does half the work).
_EVENT_BOOST = {"high": 1.50, "medium": 1.25, "low": 1.10}

# Cap & floor for proposed promo discounts so the play sits in the demo's
# slider range (0..30%). Beyond 30% the saturating lift curve flattens out
# anyway, so larger numbers don't buy meaningfully more lift.
_DISCOUNT_FLOOR = 5
_DISCOUNT_CAP = 30


@lru_cache(maxsize=1)
def _meta_brand_for_sku() -> dict[str, str]:
    """{material_id -> brand} from wide_monthly. One brand per SKU."""
    wide = SNAPSHOTS / "wide_monthly.parquet"
    if not wide.is_file():
        return {}
    df = pl.read_parquet(wide).select(["material_id", "brand"]).unique()
    return {r["material_id"]: r["brand"] for r in df.iter_rows(named=True) if r["brand"]}


def _brand_key(brand: str | None) -> str | None:
    """ESTRELLA DAMM → ESTRELLA. Matches the convention in promo_roi.parquet
    (services/forecast/causal.py builds it the same way from promo labels)."""
    if not brand:
        return None
    parts = brand.strip().split()
    return parts[0].upper() if parts else None


def _human_period(period: str | None) -> str:
    """'Jul.26' → 'Jul '26'. Stable for use in user-facing copy."""
    if not period or "." not in period:
        return period or ""
    m, y = period.split(".", 1)
    return f"{m} '{y}"


def _gap_context(sku: str, sub_channel: str, period: str | None) -> dict:
    """Pull forecast + target for the target period (or the worst at-risk
    month if no period given). Used for sizing the gap-closer play."""
    fc_path = SNAPSHOTS / "forecast.parquet"
    tg_path = SNAPSHOTS / "targets.parquet"
    if not (fc_path.is_file() and tg_path.is_file()):
        return {}
    fc = pl.read_parquet(fc_path).filter(
        (pl.col("material_id") == sku) & (pl.col("sub_channel") == sub_channel)
    )
    tg = pl.read_parquet(tg_path).filter(
        (pl.col("material_id") == sku) & (pl.col("sub_channel") == sub_channel)
    )
    if fc.height == 0 or tg.height == 0:
        return {}
    # Use the period if it lines up; otherwise pick the worst month (largest
    # negative gap_hl) in the forecast horizon.
    joined = fc.join(tg, on=["material_id", "sub_channel", "date"], how="left").with_columns(
        gap_hl=(pl.col("Hl_hat_p50") - pl.col("target_hl")),
        period=pl.col("date").dt.strftime("%b.%y"),
    )
    chosen = None
    if period:
        chosen = joined.filter(pl.col("period") == period)
    if chosen is None or chosen.height == 0:
        chosen = joined.sort("gap_hl").head(1)
    if chosen.height == 0:
        return {}
    row = chosen.row(0, named=True)
    return {
        "period": row["period"],
        "date": row["date"],
        "forecast_hl": float(row["Hl_hat_p50"]),
        "target_hl": float(row["target_hl"] or 0.0),
        "gap_hl": float(row["gap_hl"] or 0.0),
    }


# ──────────────────────────────────────────────────────────────────────────
# Play builders — each returns Play | None
# ──────────────────────────────────────────────────────────────────────────


def _play_repeat_what_worked(sku: str, sub_channel: str, target_period: str | None) -> Play | None:
    """Look at promo_roi.parquet for this SKU's brand × sub_channel. If any
    historical promo posted a positive lift, propose running it again in
    the target month at the historically-implied discount."""
    roi_path = SNAPSHOTS / "promo_roi.parquet"
    if not roi_path.is_file():
        return None
    brand = _meta_brand_for_sku().get(sku)
    bkey = _brand_key(brand)
    if not bkey:
        return None
    df = pl.read_parquet(roi_path).filter(
        (pl.col("brand_key") == bkey)
        & (pl.col("sub_channel") == sub_channel)
        & (pl.col("avg_lift_pct") > 0)
    )
    if df.height == 0:
        return None
    # Rank by lift × log(n_observations + 1) so a 10% lift across 5 cycles
    # beats a 90% lift across 1 (the latter is noisy).
    df = df.with_columns(
        _score=pl.col("avg_lift_pct") * (pl.col("n_observations") + 1).log(),
    ).sort("_score", descending=True)
    best = df.row(0, named=True)

    promo_type = best["promo_type"]
    lift_pct = float(best["avg_lift_pct"])
    n_obs = int(best["n_observations"])

    # Convert historical lift back to a discount via the same saturating
    # curve the simulator uses (1 - exp(-d / 18)). Inverse: d = -18 * ln(1 - lift).
    # Cap at the slider range and floor at a meaningful number.
    import math
    try:
        implied = -18.0 * math.log(max(1e-3, 1.0 - min(lift_pct, 0.85)))
    except ValueError:
        implied = 10.0
    discount = int(round(max(_DISCOUNT_FLOOR, min(_DISCOUNT_CAP, implied))))

    # If no explicit period, default to the worst-gap month so the play
    # arrives at the simulator pre-filled with something meaningful.
    fallback_period = None
    if not target_period:
        ctx = _gap_context(sku, sub_channel, None)
        fallback_period = ctx.get("period") if ctx else None
    months = [target_period] if target_period else ([fallback_period] if fallback_period else [])
    expected = max(0.0, min(1.2, lift_pct))
    return Play(
        kind="repeat",
        title=f"{promo_type.capitalize()} at {discount}%",
        summary=f"Repeat the {promo_type} that worked for {brand.title()}.",
        why=(
            f"+{lift_pct*100:.0f}% avg lift across {n_obs} past "
            f"cycle{'s' if n_obs != 1 else ''}"
        ),
        why_source="Historical promo ROI",
        months=months,
        action_type="promo",
        promo_type=promo_type,
        discount_pct=float(discount),
        expected_gap_closed_pct=expected,
    )


def _play_catch_the_event(sku: str, sub_channel: str, target_period: str | None) -> Play | None:
    """Scan the calendar for the closest upcoming high/medium event inside
    the 9-month forecast horizon. Propose a brand push in the lead-up."""
    ctx = _gap_context(sku, sub_channel, target_period)
    if not ctx:
        return None
    anchor: date = ctx["date"]
    horizon_end = date(
        anchor.year + (anchor.month + 8) // 12,
        ((anchor.month + 8) % 12) + 1,
        1,
    )
    start = date(anchor.year, anchor.month, 1)
    events = build_events(start, horizon_end)
    relevant = [e for e in events if e.importance in ("high", "medium")]
    if not relevant:
        return None
    # Pick the highest importance, earliest event in the window.
    relevant.sort(key=lambda e: (0 if e.importance == "high" else 1, e.period))
    ev = relevant[0]
    ev_month_start = date.fromisoformat(ev.period)
    # 2-month build-up window: ev_month - 1, ev_month. `build_events` snaps
    # events to their month-start (services/calendar.py), so we phrase the
    # `why` in "Jul '26" terms rather than quoting a wrong day-of-month.
    months_window: list[str] = []
    for offset in (-1, 0):
        y = ev_month_start.year
        m = ev_month_start.month + offset
        while m < 1:
            m += 12
            y -= 1
        while m > 12:
            m -= 12
            y += 1
        months_window.append(date(y, m, 1).strftime("%b.%y"))

    boost = _EVENT_BOOST.get(ev.importance, 1.10)
    expected = min(1.0, (boost - 1.0) * 1.8)  # ~50% of gap for medium, ~90% for high

    return Play(
        kind="event",
        title=f"Brand push around {ev.label}",
        summary=(
            f"Lean brand spend across {_human_period(months_window[0])}–"
            f"{_human_period(months_window[1])}."
        ),
        why=(
            f"{ev.label} hits {_human_period(months_window[1])} · "
            f"~+{(boost - 1) * 100:.0f}% beer demand"
        ),
        why_source="Upcoming events",
        months=months_window,
        action_type="brand-focus",
        effort_level="medium",
        expected_gap_closed_pct=expected,
    )


def _play_close_the_gap(sku: str, sub_channel: str, target_period: str | None) -> Play | None:
    """Size a promo discount to bring the gap to ~zero for the target month.
    Uses the same saturating lift curve as the simulator."""
    ctx = _gap_context(sku, sub_channel, target_period)
    if not ctx:
        return None
    forecast = ctx["forecast_hl"]
    target = ctx["target_hl"]
    gap = ctx["gap_hl"]
    if forecast <= 0 or target <= 0 or gap >= 0:
        # Already on/above target — nothing to size.
        return None
    needed_lift_pct = abs(gap) / forecast  # fraction of baseline needed
    # Inverse of the saturating curve (1 - exp(-d / 18)) ≈ lift_pct.
    import math
    try:
        implied = -18.0 * math.log(max(1e-3, 1.0 - min(needed_lift_pct, 0.85)))
    except ValueError:
        implied = _DISCOUNT_CAP
    discount = int(round(max(_DISCOUNT_FLOOR, min(_DISCOUNT_CAP, implied))))
    saturated = min(needed_lift_pct, 1.0 - math.exp(-discount / 18.0))
    closed_pct = saturated / max(needed_lift_pct, 1e-3)

    title = f"Multi-buy at {discount}%"
    summary = (
        f"Size a {discount}% multi-buy in {_human_period(ctx['period'])} "
        f"to bring the forecast back to target."
    )
    # Whether the discount fully closes the gap drives the why-line tone:
    # "covers the shortfall" vs. "covers most of it" — honest either way.
    closes_most = closed_pct >= 0.95
    why = (
        f"~{saturated*100:.0f}% lift "
        f"{'covers' if closes_most else 'covers most of'} the {abs(gap):.0f} hL shortfall"
    )

    return Play(
        kind="gap-closer",
        title=title,
        summary=summary,
        why=why,
        why_source="Forecast vs target",
        months=[ctx["period"]],
        action_type="promo",
        promo_type="multi-buy",
        discount_pct=float(discount),
        expected_gap_closed_pct=closed_pct,
    )


def build_plays(sku: str, sub_channel: str, period: str | None) -> list[Play]:
    """Compose the three plays. Each builder is independent; failures are
    silent (None) so the UI just shows fewer cards rather than blank slots."""
    out: list[Play] = []
    for fn in (_play_repeat_what_worked, _play_catch_the_event, _play_close_the_gap):
        try:
            p = fn(sku, sub_channel, period)
        except Exception:
            p = None
        if p is not None:
            out.append(p)
    return out
