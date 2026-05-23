from fastapi import APIRouter

from app.schemas import MetaResponse

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/meta", response_model=MetaResponse)
def get_meta() -> MetaResponse:
    """Filter values for the topbar. Real impl reads from snapshots/meta.json."""
    return MetaResponse(
        brands=["ESTRELLA DAMM", "VICTORIA", "DAURA", "FREE DAMM", "DAMM LEMON"],
        skus=[
            {"id": "K015600", "label": "Estrella Damm 330ml can", "brand": "ESTRELLA DAMM"},
        ],
        sub_channels=[
            "GROCERY", "FREE TRADE CMBC", "NATIONAL ON TRADE",
            "FREE TRADE", "CONVENIENCE & WHOLESALE", "MDD COPACKING",
        ],
        sales_channels=["ON TRADE", "OFF TRADE", "MDD CO-PACKING"],
        period_range=("Ene.23", "Dic.26"),
        hero={
            "sku": "K015600",
            "brand": "ESTRELLA DAMM",
            "sub_channel": "GROCERY",
            "period": "Nov.26",
        },
    )
