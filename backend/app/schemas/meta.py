from pydantic import BaseModel


class MetaResponse(BaseModel):
    brands: list[str]
    skus: list[dict]                  # [{id, label, brand}]
    sub_channels: list[str]
    sales_channels: list[str]
    period_range: tuple[str, str]     # ("Ene.23", "Dic.26")
    hero: dict                        # {sku, brand, sub_channel, period}
