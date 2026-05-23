"""GET /api/sankey — budget flow through the UK hierarchy with forecast color-coding.

Returns the nodes + links needed to render a Sankey diagram of:

   Total UK
     → Sales channels  (ON-TRADE / OFF-TRADE / MDD)
       → Sub-channels  (GROCERY, FREE TRADE CMBC, ...)
         → Brands     (top N within each sub-channel)

Each link carries:
  - source / target node indexes
  - value (Hl, becomes link width)
  - forecast_hl + target_hl + gap_pct (drives color on hover)

The frontend converts this into a Plotly Sankey trace.
"""

from functools import lru_cache
from pathlib import Path

import polars as pl
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.anonymize import sub_channel_label, sales_channel_label

router = APIRouter(prefix="/api", tags=["sankey"])

FORECAST = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "forecast.parquet"
TARGETS  = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "targets.parquet"
META     = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "meta.json"


class SankeyNode(BaseModel):
    label: str
    level: int                # 0=total, 1=sales_channel, 2=sub_channel, 3=brand
    raw_code: str | None = None
    forecast_hl: float
    target_hl: float
    gap_pct: float


class SankeyLink(BaseModel):
    source: int
    target: int
    value: float              # Hl — link width
    gap_pct: float            # for color
    label: str


class SankeyResponse(BaseModel):
    nodes: list[SankeyNode]
    links: list[SankeyLink]


@lru_cache(maxsize=4)
def _build_sankey(top_brands_per_subchannel: int = 4) -> SankeyResponse:
    if not FORECAST.is_file() or not TARGETS.is_file():
        raise HTTPException(503, "Missing forecast.parquet or targets.parquet — run make train")

    fc = pl.read_parquet(FORECAST)
    tg = pl.read_parquet(TARGETS)

    # Filter targets to overlap with forecast window
    keys = fc.select(["material_id", "sub_channel", "date"]).unique()
    tg_in_window = tg.join(keys, on=["material_id", "sub_channel", "date"], how="inner")

    # Brand × sub_channel aggregates
    by_brand = (
        fc.group_by(["sales_channel", "sub_channel", "brand"])
        .agg(forecast=pl.col("Hl_hat_p50").sum())
        .join(
            tg_in_window.join(
                fc.select(["material_id", "sub_channel", "brand"]).unique(),
                on=["material_id", "sub_channel"], how="left",
            ).group_by(["sub_channel", "brand"]).agg(target=pl.col("target_hl").sum()),
            on=["sub_channel", "brand"], how="left",
        )
        .with_columns(
            target=pl.col("target").fill_null(0.0),
            gap_pct=((pl.col("forecast") - pl.col("target")) / pl.col("target").clip(lower_bound=1)).fill_null(0.0),
        )
    )

    # Build node list (level 0..3)
    nodes: list[SankeyNode] = []
    node_idx: dict[tuple, int] = {}

    def add_node(key: tuple, label: str, level: int, raw: str | None,
                 forecast: float, target: float) -> int:
        if key in node_idx:
            return node_idx[key]
        idx = len(nodes)
        gap_pct = (forecast - target) / max(target, 1.0) if target > 0 else 0.0
        nodes.append(SankeyNode(
            label=label, level=level, raw_code=raw,
            forecast_hl=forecast, target_hl=target, gap_pct=gap_pct,
        ))
        node_idx[key] = idx
        return idx

    total_fc = float(fc["Hl_hat_p50"].sum())
    total_tg = float(tg_in_window["target_hl"].sum())
    root = add_node(("total",), "UK Total", 0, None, total_fc, total_tg)

    links: list[SankeyLink] = []

    # Level 1: sales channels
    sales_agg = (
        fc.group_by("sales_channel")
        .agg(forecast=pl.col("Hl_hat_p50").sum())
        .join(
            tg_in_window.join(
                fc.select(["material_id", "sub_channel", "sales_channel"]).unique(),
                on=["material_id", "sub_channel"], how="left",
            ).group_by("sales_channel").agg(target=pl.col("target_hl").sum()),
            on="sales_channel", how="left",
        )
        .with_columns(target=pl.col("target").fill_null(0.0))
        .sort("forecast", descending=True)
    )
    for r in sales_agg.iter_rows(named=True):
        sc = r["sales_channel"]
        node = add_node(("sales", sc), sales_channel_label(sc), 1, sc,
                        float(r["forecast"]), float(r["target"]))
        gp = (r["forecast"] - r["target"]) / max(r["target"], 1.0) if r["target"] > 0 else 0.0
        links.append(SankeyLink(
            source=root, target=node, value=float(r["forecast"]),
            gap_pct=gp, label=f"{sales_channel_label(sc)}: {r['forecast']:,.0f} Hl",
        ))

    # Level 2: sub-channels (per sales channel)
    sub_agg = (
        fc.group_by(["sales_channel", "sub_channel"])
        .agg(forecast=pl.col("Hl_hat_p50").sum())
        .join(
            tg_in_window.group_by("sub_channel").agg(target=pl.col("target_hl").sum()),
            on="sub_channel", how="left",
        )
        .with_columns(target=pl.col("target").fill_null(0.0))
        .sort(["sales_channel", "forecast"], descending=[False, True])
    )
    for r in sub_agg.iter_rows(named=True):
        sc, sub = r["sales_channel"], r["sub_channel"]
        parent_idx = node_idx[("sales", sc)]
        sub_idx = add_node(("sub", sub), sub_channel_label(sub), 2, sub,
                           float(r["forecast"]), float(r["target"]))
        gp = (r["forecast"] - r["target"]) / max(r["target"], 1.0) if r["target"] > 0 else 0.0
        links.append(SankeyLink(
            source=parent_idx, target=sub_idx, value=float(r["forecast"]),
            gap_pct=gp, label=f"{sub_channel_label(sub)}: {r['forecast']:,.0f} Hl",
        ))

    # Level 3: top N brands per sub-channel
    for sub in by_brand["sub_channel"].unique().to_list():
        sub_rows = (
            by_brand.filter(pl.col("sub_channel") == sub)
            .sort("forecast", descending=True)
            .head(top_brands_per_subchannel)
        )
        sub_idx = node_idx.get(("sub", sub))
        if sub_idx is None:
            continue
        for r in sub_rows.iter_rows(named=True):
            brand = r["brand"]
            brand_label = " ".join(w.capitalize() for w in (brand or "").lower().split()) or "Unknown"
            brand_idx = add_node(("brand", sub, brand), f"{brand_label}", 3, brand,
                                 float(r["forecast"]), float(r["target"]))
            gp = float(r["gap_pct"]) if r["gap_pct"] is not None else 0.0
            links.append(SankeyLink(
                source=sub_idx, target=brand_idx, value=float(r["forecast"]),
                gap_pct=gp,
                label=f"{brand_label}: {r['forecast']:,.0f} Hl ({gp:+.1%} vs target)",
            ))

    return SankeyResponse(nodes=nodes, links=links)


@router.get("/sankey", response_model=SankeyResponse)
def get_sankey(top_brands: int = Query(default=4, ge=1, le=10)) -> SankeyResponse:
    return _build_sankey(top_brands)
