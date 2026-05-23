"""ETL pipeline — raw Excel → tidy Parquet snapshots.

Run with:  make data           (or: python -m app.services.etl)

Inputs (under backend/app/data/raw/, gitignored):
- UK DATA.xlsx                              (sheets: DATABASE, MaterialData, CUSTOMERS)
- Damm Trade Plan - promotions.xlsx         (sheets: Tesco, Sainsbury's, Waitrose, Morrisons, Asda)

Outputs (under backend/app/data/snapshots/, also gitignored):
- wide_monthly.parquet     SKU × SubChannel × month — the primary training table
- budgets.parquet          extracted from null-Hl DATABASE rows (the plan)
- promos.parquet           long-form, one row per (channel, sku, iso_week, event)
- meta.json                brand / SKU / sub_channel / period lists for FE filters

Pipeline steps live in module-level functions so they're individually
testable. The CLI entry point is `main()` at the bottom.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Final

import polars as pl

from app.services.anonymize import anonymize, anonymize_promo_sheet

# ────────────────────────────────────────────────────────────────────────────
# Paths
# ────────────────────────────────────────────────────────────────────────────

ROOT       = Path(__file__).resolve().parents[2]
RAW        = ROOT / "app" / "data" / "raw"
SNAPSHOTS  = ROOT / "app" / "data" / "snapshots"
SALES_XLSX = RAW / "UK DATA.xlsx"
PROMO_XLSX = RAW / "Damm Trade Plan - promotions.xlsx"

ALLOWED_SUB_CHANNELS: Final[set[str]] = {
    "GROCERY",
    "FREE TRADE CMBC",
    "NATIONAL ON TRADE",
    "FREE TRADE",
    "CONVENIENCE & WHOLESALE",
    "MDD COPACKING",
}

SPA_MONTH: Final[dict[str, int]] = {
    "Ene": 1, "Feb": 2, "Mar": 3, "Abr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Ago": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dic": 12,
}


# ────────────────────────────────────────────────────────────────────────────
# Pure helpers (testable without I/O)
# ────────────────────────────────────────────────────────────────────────────

def parse_period(s: str | None) -> date | None:
    """`Abr.25` → date(2025, 4, 1). Anything unparseable → None."""
    if not s:
        return None
    try:
        m, y = s.split(".")
        return date(2000 + int(y), SPA_MONTH[m[:3]], 1)
    except (KeyError, ValueError):
        return None


def extract_cliente(s: str | None) -> int | None:
    """`1/1/91/117738 CARLSBERG SUPPLY COMPANY AG` → 117738."""
    if not s:
        return None
    try:
        last = str(s).split("/")[-1].strip()
        return int(last.split()[0])
    except (ValueError, IndexError):
        return None


def extract_material(s: str | None) -> str | None:
    """`K015600 CERVEZA CORRIENTE EXPORT DAMM A21` → `K015600`."""
    if not s:
        return None
    parts = str(s).strip().split()
    return parts[0] if parts else None


def extract_customer_name(s: str | None) -> str | None:
    """`1/1/91/117738 CARLSBERG SUPPLY COMPANY AG` → `CARLSBERG SUPPLY COMPANY AG`."""
    if not s:
        return None
    try:
        last = str(s).split("/")[-1].strip()
        parts = last.split(None, 1)
        return parts[1].strip() if len(parts) == 2 else None
    except (ValueError, IndexError):
        return None


# ────────────────────────────────────────────────────────────────────────────
# Loaders
# ────────────────────────────────────────────────────────────────────────────

def load_sales_raw() -> pl.DataFrame:
    """Load DATABASE sheet, parse periods, extract numeric IDs."""
    df = pl.read_excel(SALES_XLSX, sheet_name="DATABASE")
    print(f"  · DATABASE: {len(df):,} rows, {len(df.columns)} cols")
    out = df.with_columns(
        pl.col("AÑO CALENDARIO").map_elements(parse_period, return_dtype=pl.Date).alias("date"),
        pl.col("Cod. Cliente").map_elements(extract_cliente, return_dtype=pl.Int64).alias("cliente_id"),
        pl.col("Cod. Material").map_elements(extract_material, return_dtype=pl.String).alias("material_id"),
        pl.col("Cod. Cliente").map_elements(extract_customer_name, return_dtype=pl.String).alias("customer_name_raw"),
    )
    # Drop rows where the time parse failed — they're junk
    out = out.filter(pl.col("date").is_not_null())
    print(f"  · after period parse: {len(out):,} rows ({out['date'].min()} → {out['date'].max()})")
    return out


def load_customers_uk() -> pl.DataFrame:
    """Load CUSTOMERS sheet, filter to UK, anonymize the customer group names."""
    df = pl.read_excel(SALES_XLSX, sheet_name="CUSTOMERS")
    print(f"  · CUSTOMERS: {len(df)} rows total")
    uk = df.filter(pl.col("Pais") == "Reino Unido")
    print(f"  · UK only:   {len(uk)} rows")
    # Validate SubChannel domain
    sub_values = set(uk["SubChannel"].drop_nulls().unique().to_list())
    unexpected = sub_values - ALLOWED_SUB_CHANNELS
    if unexpected:
        print(f"  ! unexpected SubChannel values (will be dropped from final): {unexpected}")
    out = uk.with_columns(
        pl.col("Agrupacion BU3").map_elements(anonymize, return_dtype=pl.String).alias("customer_anon"),
    ).select(
        pl.col("Cod. Cliente").alias("cliente_id"),
        pl.col("Sales Channel").alias("sales_channel"),
        pl.col("SubChannel").alias("sub_channel"),
        pl.col("Agrupacion BU3").alias("agrupacion_raw"),
        "customer_anon",
    )
    return out


def load_materials() -> pl.DataFrame:
    """Load MaterialData, drop junk cols, normalize the material code."""
    df = pl.read_excel(SALES_XLSX, sheet_name="MaterialData")
    print(f"  · MaterialData: {len(df)} rows")
    # Drop Unnamed: * columns (they're all-null junk)
    keep = [c for c in df.columns if not c.startswith("Unnamed")]
    df = df.select(keep)
    out = df.with_columns(
        pl.col("Cod. Material").cast(pl.String).str.strip_chars().alias("material_id"),
    ).select(
        "material_id",
        pl.col("Marca").alias("brand"),
        pl.col("Línea Negocio").alias("business_line"),
        pl.col("Tipo Envase").alias("package_type_es"),
        pl.col("PACK TYPE").alias("pack_type"),
        pl.col("PACK SIZE").alias("pack_size"),
        pl.col("ALC. %").alias("alc_pct"),
        pl.col("L por SKU").alias("litres_per_sku"),
    ).unique(subset=["material_id"], keep="first")  # dedupe; some SKUs appear multiple times
    return out


# ────────────────────────────────────────────────────────────────────────────
# Transforms
# ────────────────────────────────────────────────────────────────────────────

def split_actuals_budget(sales: pl.DataFrame) -> tuple[pl.DataFrame, pl.DataFrame]:
    """Null Hl rows are budget/plan; non-null are actuals. Returns (actuals, budget)."""
    actuals = sales.filter(pl.col("Hl").is_not_null())
    budget  = sales.filter(pl.col("Hl").is_null())
    print(f"  · actuals: {len(actuals):,}  ·  budget rows: {len(budget):,}")
    return actuals, budget


def net_returns(actuals: pl.DataFrame) -> pl.DataFrame:
    """Net negative Hl (returns/credit notes) against same (cliente, material, month)."""
    n_neg = (actuals["Hl"] < 0).sum()
    print(f"  · negative Hl rows pre-net: {n_neg:,}")
    netted = (
        actuals
        .group_by(["cliente_id", "material_id", "date"])
        .agg(
            pl.col("Hl").sum(),
            pl.col("Venta Neta").sum().alias("revenue_gbp"),
            pl.col("Margen Bruto").sum().alias("margin_gbp"),
        )
        .filter(pl.col("Hl") > 0)  # drop where net is zero or negative
    )
    print(f"  · after net+filter: {len(netted):,} rows")
    return netted


def join_uk(actuals_netted: pl.DataFrame, customers_uk: pl.DataFrame, materials: pl.DataFrame) -> pl.DataFrame:
    """Inner-join netted actuals to UK customers and material master."""
    joined = (
        actuals_netted
        .join(customers_uk, on="cliente_id", how="inner")
        .join(materials,    on="material_id", how="inner")
        .filter(pl.col("sub_channel").is_in(list(ALLOWED_SUB_CHANNELS)))
    )
    print(f"  · joined UK: {len(joined):,} rows  ·  "
          f"customers={joined['cliente_id'].n_unique()}  "
          f"SKUs={joined['material_id'].n_unique()}  "
          f"brands={joined['brand'].n_unique()}")
    return joined


def aggregate_monthly(joined: pl.DataFrame) -> pl.DataFrame:
    """SKU × SubChannel × month, summed Hl/revenue/margin. The main training table."""
    monthly = (
        joined
        .group_by(["material_id", "brand", "sub_channel", "sales_channel", "date"])
        .agg(
            pl.col("Hl").sum(),
            pl.col("revenue_gbp").sum(),
            pl.col("margin_gbp").sum(),
            pl.col("cliente_id").n_unique().alias("n_customers"),
            (pl.col("customer_anon") == "Distributor (B2B)").any().alias("has_cmbc"),
        )
        .with_columns(
            # static features useful later for ML
            pl.col("date").dt.month().alias("month"),
            pl.col("date").dt.quarter().alias("quarter"),
            pl.col("date").dt.year().alias("year"),
        )
        .sort(["material_id", "sub_channel", "date"])
    )
    print(f"  · monthly grain: {len(monthly):,} rows ({monthly['material_id'].n_unique()} SKUs × {monthly['sub_channel'].n_unique()} subchannels)")
    return monthly


def build_budgets(budget: pl.DataFrame, customers_uk: pl.DataFrame, materials: pl.DataFrame) -> pl.DataFrame:
    """The null-Hl rows are the plan. Same grain as monthly, but for the budget series."""
    if len(budget) == 0:
        return pl.DataFrame(schema={
            "material_id": pl.String, "sub_channel": pl.String, "date": pl.Date,
            "budget_hl": pl.Float64,
        })
    # Some budget rows lack PVE or other figures — use whatever numeric we have as a proxy.
    # If Damm encodes the planned Hl in another column (e.g. one of the IIEE/PVE), we'll
    # discover it in EDA; for now we surface the row count and any usable hint.
    out = (
        budget
        .filter(pl.col("cliente_id").is_not_null() & pl.col("material_id").is_not_null())
        .join(customers_uk, on="cliente_id", how="inner")
        .join(materials, on="material_id", how="inner")
        .filter(pl.col("sub_channel").is_in(list(ALLOWED_SUB_CHANNELS)))
        .with_columns(
            # Placeholder until the budget magnitude column is confirmed during EDA.
            # `Venta Neta` is non-null on many budget rows; treat it as the planned revenue
            # and surface it for now — ML will use a confirmed budget_hl column later.
            pl.col("Venta Neta").alias("planned_revenue_gbp"),
        )
        .group_by(["material_id", "brand", "sub_channel", "date"])
        .agg(
            pl.col("planned_revenue_gbp").sum(),
            pl.lit(0.0).alias("budget_hl"),  # TODO: confirm budget Hl column in EDA
        )
        .sort(["material_id", "sub_channel", "date"])
    )
    print(f"  · budget rows after UK join: {len(out):,}")
    return out


# ────────────────────────────────────────────────────────────────────────────
# Promo parsing (5 retailer-specific layouts — best-effort first pass)
# ────────────────────────────────────────────────────────────────────────────

@dataclass
class PromoRow:
    channel: str           # anonymized retailer
    sku: str | None
    iso_week: date | None
    event_label: str
    promo_type: str        # multi-pack | price-cut | feature | display | off-invoice | other
    discount_pct: float | None
    notes: str | None


def _classify_event(label: str) -> str:
    """Best-effort tag from the event label text."""
    l = label.lower()
    if any(k in l for k in ["multi", "multibuy", "mpu", "mpf", "2 for", "3 for"]):
        return "multi-pack"
    if any(k in l for k in ["price drop", "great value", "rollback", "save", "-£", "% off"]):
        return "price-cut"
    if any(k in l for k in ["feature", "endcap", "tpr", "front of"]):
        return "feature"
    if "display" in l or "secondary" in l:
        return "display"
    if "off-invoice" in l or "off invoice" in l:
        return "off-invoice"
    return "other"


def parse_promos_all() -> pl.DataFrame:
    """
    First-pass promo parser. The five Damm sheets have very different layouts
    (see DATA.md §4). This implementation focuses on the structure they DO share:
    a header row with date ranges, and a SKU column. Anything we can't confidently
    parse is dropped with a warning rather than guessed.

    Result columns: channel, sku, iso_week, event_label, promo_type, discount_pct, notes.
    """
    import openpyxl
    wb = openpyxl.load_workbook(PROMO_XLSX, read_only=True, data_only=True)
    rows: list[PromoRow] = []

    DATE_RANGE = re.compile(r"(\d{1,2})/(\d{1,2})\s*-\s*(\d{1,2})/(\d{1,2})")

    for sheet_name in wb.sheetnames:
        channel = anonymize_promo_sheet(sheet_name)
        ws = wb[sheet_name]
        sheet_rows = list(ws.values)
        if not sheet_rows:
            continue

        # Find the row index of the header (the one with date-range strings or datetime cells)
        header_idx = None
        for i, row in enumerate(sheet_rows[:6]):
            cells = [c for c in row if c is not None]
            if not cells:
                continue
            # Prefer a row dominated by date ranges or actual datetimes
            n_date = sum(
                1 for c in cells
                if isinstance(c, str) and DATE_RANGE.search(c)
                or hasattr(c, "year")   # datetime-like
            )
            if n_date >= 2:
                header_idx = i
                break
        if header_idx is None:
            print(f"  ! {sheet_name!r}: couldn't find a header row — skipped")
            continue

        header = sheet_rows[header_idx]
        # Each non-empty header cell becomes a (col_idx, label) pair
        cols_with_labels = [
            (j, str(c).strip()) for j, c in enumerate(header) if c is not None and str(c).strip()
        ]

        # For each subsequent row, the first non-numeric cell is treated as the SKU label
        for row in sheet_rows[header_idx + 1:]:
            if not row or all(c is None for c in row):
                continue
            sku_cell = next((c for c in row if isinstance(c, str) and c.strip()), None)
            sku = sku_cell.strip() if sku_cell else None

            for col_idx, label in cols_with_labels:
                if col_idx >= len(row):
                    continue
                cell = row[col_idx]
                if cell is None or (isinstance(cell, float) and cell != cell):  # NaN
                    continue
                if isinstance(cell, str) and not cell.strip():
                    continue

                # The cell content is usually a price/discount marker; existence = promo active
                m = DATE_RANGE.search(label)
                iso_week = None
                if m:
                    d, mo, _, _ = m.groups()
                    try:
                        iso_week = date(2026, int(mo), int(d))
                    except ValueError:
                        iso_week = None
                discount_pct = None
                if isinstance(cell, (int, float)):
                    discount_pct = float(cell) if 0 < cell <= 100 else None

                rows.append(PromoRow(
                    channel=channel,
                    sku=sku,
                    iso_week=iso_week,
                    event_label=label[:200],
                    promo_type=_classify_event(label),
                    discount_pct=discount_pct,
                    notes=None,
                ))

    if not rows:
        print("  ! parsed 0 promo rows from all sheets — sheets may need bespoke parsers")
        return pl.DataFrame(schema={
            "channel": pl.String, "sku": pl.String, "iso_week": pl.Date,
            "event_label": pl.String, "promo_type": pl.String,
            "discount_pct": pl.Float64, "notes": pl.String,
        })

    df = pl.DataFrame(
        [r.__dict__ for r in rows],
        schema={
            "channel": pl.String, "sku": pl.String, "iso_week": pl.Date,
            "event_label": pl.String, "promo_type": pl.String,
            "discount_pct": pl.Float64, "notes": pl.String,
        },
    )
    print(f"  · promos parsed: {len(df):,} rows from {df['channel'].n_unique()} channels")
    return df


# ────────────────────────────────────────────────────────────────────────────
# External enrichment (Phase 1: just UK holidays; weather/trends are H4-H6)
# ────────────────────────────────────────────────────────────────────────────

def attach_uk_holidays(monthly: pl.DataFrame) -> pl.DataFrame:
    """Per-month count of UK bank holidays."""
    import holidays as hd
    years = sorted(monthly["year"].unique().to_list())
    uk = hd.country_holidays("GB", years=years)
    counts: dict[date, int] = {}
    for d in uk.keys():
        first = date(d.year, d.month, 1)
        counts[first] = counts.get(first, 0) + 1

    return monthly.with_columns(
        pl.col("date").map_elements(lambda d: counts.get(d, 0), return_dtype=pl.Int32).alias("uk_holidays_count")
    )


# ────────────────────────────────────────────────────────────────────────────
# Validation
# ────────────────────────────────────────────────────────────────────────────

def validate_monthly(monthly: pl.DataFrame) -> None:
    """Cheap sanity checks. Raises if anything obviously broken."""
    assert len(monthly) > 0, "monthly is empty"
    assert monthly["Hl"].min() > 0, "non-positive Hl in monthly (should have been netted out)"
    sub_set = set(monthly["sub_channel"].unique().to_list())
    bad = sub_set - ALLOWED_SUB_CHANNELS
    assert not bad, f"unexpected sub_channels: {bad}"
    n_null_period = monthly["date"].null_count()
    assert n_null_period == 0, f"{n_null_period} null dates in monthly"
    print(f"  · validation passed ({len(monthly):,} rows)")


# ────────────────────────────────────────────────────────────────────────────
# Output writers
# ────────────────────────────────────────────────────────────────────────────

def write_snapshots(monthly: pl.DataFrame, budgets: pl.DataFrame, promos: pl.DataFrame) -> None:
    SNAPSHOTS.mkdir(parents=True, exist_ok=True)
    monthly.write_parquet(SNAPSHOTS / "wide_monthly.parquet")
    budgets.write_parquet(SNAPSHOTS / "budgets.parquet")
    promos.write_parquet(SNAPSHOTS / "promos.parquet")
    print(f"  · wrote wide_monthly.parquet ({len(monthly):,} rows)")
    print(f"  · wrote budgets.parquet      ({len(budgets):,} rows)")
    print(f"  · wrote promos.parquet       ({len(promos):,} rows)")


def write_meta(monthly: pl.DataFrame) -> None:
    """meta.json drives the FE filter dropdowns."""
    brands = sorted(monthly["brand"].drop_nulls().unique().to_list())
    sub_channels = sorted(monthly["sub_channel"].drop_nulls().unique().to_list())
    sales_channels = sorted(monthly["sales_channel"].drop_nulls().unique().to_list())
    skus = (
        monthly
        .group_by("material_id")
        .agg(pl.col("brand").first(), pl.col("Hl").sum().alias("total_hl"))
        .sort("total_hl", descending=True)
        .with_columns(label=pl.col("material_id"))
        .select(
            pl.col("material_id").alias("id"),
            "label",
            "brand",
        )
        .to_dicts()
    )
    periods = sorted(monthly["date"].unique().to_list())
    period_strings = [d.strftime("%Y-%m") for d in periods]

    # Hero: top-volume SKU in (top_brand × GROCERY) — drives demo deep-link and
    # snapshot generation. Picked dynamically so it stays accurate as data evolves.
    top_brand = brands_by_volume = monthly.group_by("brand").agg(pl.col("Hl").sum()).sort("Hl", descending=True)
    top_brand_name = top_brand[0, "brand"]
    hero_row = (
        monthly
        .filter((pl.col("brand") == top_brand_name) & (pl.col("sub_channel") == "GROCERY"))
        .group_by("material_id")
        .agg(pl.col("Hl").sum().alias("total_hl"))
        .sort("total_hl", descending=True)
        .head(1)
    )
    if len(hero_row) == 0:
        hero = {"sku": None, "brand": top_brand_name, "sub_channel": "GROCERY", "period": "2026-11"}
    else:
        hero = {
            "sku": hero_row[0, "material_id"],
            "brand": top_brand_name,
            "sub_channel": "GROCERY",
            "period": "2026-11",
        }

    meta = {
        "brands": brands,
        "skus": skus,
        "sub_channels": sub_channels,
        "sales_channels": sales_channels,
        "period_range": [period_strings[0], period_strings[-1]],
        "n_months": len(periods),
        "n_skus": len(skus),
        "hero": hero,
    }
    (SNAPSHOTS / "meta.json").write_text(json.dumps(meta, indent=2, default=str))
    print(f"  · wrote meta.json ({len(brands)} brands, {len(skus)} SKUs, {meta['period_range']})")


# ────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ────────────────────────────────────────────────────────────────────────────

def main() -> int:
    print("=" * 70)
    print("MarketPulse UK — ETL")
    print("=" * 70)

    print("\n[1/8] Loading sales (DATABASE sheet)")
    sales_raw = load_sales_raw()

    print("\n[2/8] Loading UK customers")
    customers_uk = load_customers_uk()

    print("\n[3/8] Loading materials")
    materials = load_materials()

    print("\n[4/8] Splitting actuals vs budget rows")
    actuals, budget = split_actuals_budget(sales_raw)

    print("\n[5/8] Netting returns")
    actuals_netted = net_returns(actuals)

    print("\n[6/8] Joining sales × customers × materials (UK only)")
    joined = join_uk(actuals_netted, customers_uk, materials)

    print("\n[7/8] Aggregating to monthly grain + external enrichment")
    monthly = aggregate_monthly(joined)
    monthly = attach_uk_holidays(monthly)
    validate_monthly(monthly)

    print("\n[8/8] Parsing promos and writing snapshots")
    budgets = build_budgets(budget, customers_uk, materials)
    promos = parse_promos_all()
    write_snapshots(monthly, budgets, promos)
    write_meta(monthly)

    print("\nDone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
