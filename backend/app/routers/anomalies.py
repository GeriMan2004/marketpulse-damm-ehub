"""GET /api/anomalies — reads STL+MAD anomalies from snapshots/anomalies.parquet."""

from functools import lru_cache
from pathlib import Path

import polars as pl
from fastapi import APIRouter, HTTPException, Query

from app.schemas import AnomalyEvent

router = APIRouter(prefix="/api", tags=["anomalies"])

ANOMALIES_PATH = Path(__file__).resolve().parents[1] / "data" / "snapshots" / "anomalies.parquet"


@lru_cache(maxsize=1)
def _load() -> pl.DataFrame:
    if not ANOMALIES_PATH.is_file():
        raise HTTPException(status_code=503, detail="anomalies.parquet missing — run make train")
    return pl.read_parquet(ANOMALIES_PATH)


@router.get("/anomalies", response_model=list[AnomalyEvent])
def get_anomalies(
    sku: str | None = Query(default=None),  # AnomalyEvent.sku maps from brand here
    brand: str | None = Query(default=None),
    sub_channel: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
) -> list[AnomalyEvent]:
    df = _load()
    if brand:
        df = df.filter(pl.col("brand") == brand)
    if sub_channel:
        df = df.filter(pl.col("sub_channel") == sub_channel)
    df = df.sort("z_score", descending=True)
    return [
        AnomalyEvent(
            sku=r["brand"],  # anomalies are at brand × sub_channel grain
            sub_channel=r["sub_channel"],
            period=r["period"].strftime("%b.%y"),
            actual_hl=float(r["actual_hl"]),
            expected_hl=float(r["expected_hl"]),
            z_score=float(r["z_score"]),
            candidate_cause=r["candidate_cause"],
        )
        for r in df.head(limit).iter_rows(named=True)
    ]
