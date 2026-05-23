from pydantic import BaseModel, Field


class MetaResponse(BaseModel):
    brands: list[str]
    skus: list[dict]                                   # [{id, label, brand}]
    sub_channels: list[str]                            # raw codes (back-compat)
    sub_channels_labeled: list[dict] = Field(default_factory=list)  # [{code, label}]
    sales_channels: list[str]
    sales_channels_labeled: list[dict] = Field(default_factory=list)
    period_range: tuple[str, str]                      # ("Ene.23", "Dic.26")
    hero: dict                                         # {sku, brand, sub_channel, period}
