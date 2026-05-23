# Data — sources, audit, ETL, anonymization

> Damm data is **confidential**. The Excel files **must not** be committed to this public repo. See [.gitignore](.gitignore).
> Local-only location: `~/Downloads/Repte internacional/` → copy to `backend/app/data/raw/` before running anything.

---

## 📁 Source files

| File | Size | Sheets | Notes |
|---|---|---|---|
| `UK DATA.xlsx` | 4.2 MB | `MaterialData`, `CUSTOMERS`, `DATABASE` | Spanish column names; **DATABASE contains both actuals AND budget rows** (null Hl = budget) |
| `Damm Trade Plan - promotions.xlsx` | 400 KB | `Tesco`, `Sainsbury's`, `Waitrose `, `Morrisons`, `Asda` | Wide calendar, one sheet per retailer; **each sheet has a different layout** (see §4) |

---

## 📊 Audit results (live, not assumptions)

**Coverage**

- **40 months** of data: Jan 2023 → Apr 2026
- **191 UK customers** in DATABASE (of 219 listed in CUSTOMERS — 28 listed customers had no sales activity)
- **199 SKUs** sold in UK
- **31 brands** active in UK (top: ESTRELLA DAMM = 85% of UK volume, then VICTORIA, ROSA BLANCA, FREE DAMM, DAMM LEMON, DAURA)
- **40% of UK volume = one customer (CMBC = Carlsberg Marston's Brewing Co)** — a B2B distribution relationship

**Quality**

- **21.3% of UK rows have null `Hl`** → these are budget/plan rows mixed into the same fact table. Tag and split (`is_actual = Hl.notna() and Hl > 0`).
- **1,186 rows with negative Hl** → returns / credit notes. Net them against `(cliente, material, month)` before training.
- **`Mktg Fund` is 100% null** → don't use this column.

**Volume map**

| Sales Channel | UK Hl | % UK | n customers |
|---|---|---|---|
| ON TRADE (pubs/restaurants) | 1,072,093 | 53% | 131 |
| OFF TRADE (retail) | 890,916 | 44% | 52 |
| MDD CO-PACKING | 57,916 | 3% | 8 |

| SubChannel | UK Hl | n SKUs |
|---|---|---|
| **FREE TRADE CMBC** | 815,580 | 137 |
| **GROCERY** ← promo plan applies here | 631,779 | 76 |
| CONVENIENCE & WHOLESALE | 259,137 | 112 |
| NATIONAL ON TRADE | 185,411 | 47 |
| FREE TRADE | 71,102 | 79 |
| MDD COPACKING | 57,916 | 20 |

**Seasonality**

- Strong: peak/trough = **2.07× (Mar peak, Jan trough)** across all UK
- ESTRELLA DAMM: 2.11×, FREE DAMM peaks summer (Jul), Christmas push in Dec

**Year-over-year (top brand)**

- ESTRELLA DAMM: 475k → 467k → 472k Hl (basically flat — predictable demand)
- Several new brands launched in 2024–2025 (DAMM LEMON +126%, SAN MARCOS new, ESTRELLA NON-ALCOHOLIC new)

**Series shape (essential for ML choices)**

| Aggregation level | # series | Median months | ≥24 mo | ≤2 mo (cold) |
|---|---|---|---|---|
| SKU × SubChannel | 471 | 6 | 38 | **117** |
| SKU × ON/OFF | 281 | 8 | 28 | 60 |
| Brand × SubChannel | 82 | 16 | **32** | 13 |
| Brand only | 30 | 14 | 10 | 7 |
| SubChannel only | 6 | 40 | 6 | 0 |

→ Drives the decision to **train one global model** across all 471 series (so the 117 cold-start ones can borrow strength). See [ML.md](ML.md).

---

## 🗃️ Sheet-by-sheet column dictionary

### `UK DATA.xlsx :: DATABASE` (25,714 rows total, 25,389 UK after join)

| Column (raw) | Type | Meaning | Used as |
|---|---|---|---|
| `AÑO CALENDARIO` | str | Period e.g. `Abr.25` | **time** (parsed to month-start date) |
| `Cod. Cliente` | str | Path-format `1/1/91/117738 CARLSBERG SUPPLY COMPANY AG` — **extract last numeric segment for join** | join key → CUSTOMERS |
| `Cod. Material` | str | `K015600 CERVEZA CORRIENTE EXPORT DAMM A21` — **extract first token for join** | join key → MaterialData |
| `Hl` | float | Hectoliters — null = budget row, negative = return | **target** |
| `Ventas Brutas` | float | Gross sales (GBP) | |
| `Venta Neta` | float | Net sales | **secondary target** (revenue, for ROI) |
| `Bonif.` | float | Bonifications / rebates | |
| `IIEE`, `PVE`, `Otros Imp.`, `VN después impto.` | float | Excise, standard price, other taxes, net-after-tax | reference only |
| `CEL`, `CEP` | float | Production cost, packaging cost | for unit margin |
| `Margen Bruto` | float | Gross margin | for ROI |
| `Mktg Fund` | — | **100% null** | drop |
| `MB Comercial + Mkt Fund` | float | Margin + marketing fund | |
| `Negocio` | str | Business unit grouping | |

### `UK DATA.xlsx :: MaterialData` (2,985 rows; ~199 used for UK)

| Column (raw) | Used | As |
|---|---|---|
| `Cod. Material` | ✅ | join key (strip whitespace) |
| `Marca` | ✅ | **brand** (31 distinct in UK) |
| `Línea Negocio` | ✅ | line (Cerveza / Refrescos / etc.) |
| `Tipo Envase` | ✅ | package type |
| `PACK TYPE`, `PACK SIZE` | ✅ | static features |
| `ALC. %`, `L por SKU` | ✅ | static numeric |
| `Business Brands`, `NEW NEGOCIO` | — | reference |
| `Unnamed: 22-24` | ❌ | drop (junk) |

### `UK DATA.xlsx :: CUSTOMERS` (232 rows; 219 UK)

| Column (raw) | Used | As |
|---|---|---|
| `Cod. Cliente` | ✅ | join key (int) |
| `Pais` | ✅ | filter `== 'Reino Unido'` |
| `Sales Channel` | ⚠️ | 3-value coarse channel — **not the UI filter** |
| `SubChannel` | ✅ | **THE channel field** the UI uses (see §3) |
| `Agrupacion`, `Agrupacion BU3` | ✅ | customer group → input to anonymization map |
| `Account Manager`, `BDM`, `Jefe de zona` | ❌ | internal owners — never surface in demo |
| `ZONA VENTA`, `Cuadrante Export` | — | reference |

---

## 🆔 The channel filter is `SubChannel` — pinned

**Decision: the "Channel" filter throughout the UI and API maps to `CUSTOMERS.SubChannel`.** Six values, after anonymization (§5):

| Raw SubChannel | UI label (anonymized) |
|---|---|
| `GROCERY` | `Off-trade grocery` |
| `FREE TRADE CMBC` | `B2B distributor` |
| `NATIONAL ON TRADE` | `National on-trade` |
| `FREE TRADE` | `Independent on-trade` |
| `CONVENIENCE & WHOLESALE` | `Convenience & wholesale` |
| `MDD COPACKING` | `Co-packing` |

`Sales Channel` (3 values) is used internally as a feature, but never as a UI filter. `Agrupacion BU3` is used only inside `anonymize.py` to build channel labels per-customer; never displayed raw.

---

## 🕵️ Anonymization mapping

The brief forbids real supermarket/customer names. We map every retailer/customer group seen in the demo to a stable, sortable, generic label.

```python
# backend/app/services/anonymize.py
ANON_MAP = {
    # Retailers (from promo file + Agrupacion BU3)
    "TESCO PLC":                            "Grocer A",
    "J SAINSBURY":                          "Grocer B",
    "ASDA STORES LIMITED":                  "Grocer C",
    "WM MORRISONS":                         "Grocer D",
    "WAITROSE":                             "Grocer E",      # not in BU3 but in promo file
    "ALDI STORES LTD - ATHERSTONE":         "Discounter A",
    "LIDL GREAT BRITAIN LIMITED":           "Discounter B",
    "THE CO-OPERATIVE GROUP":               "Convenience A",
    # B2B distribution
    "CMBC":                                 "Distributor (B2B)",
    # On-trade groups (pubs)
    "YOUNGS PLC":                           "Pubco A",
    "GREENE KING BREWING & RETAILING LTD":  "Pubco B",
    "MARSTON'S":                            "Pubco C",
    "BUTCOMBE BREWING CO":                  "Pubco D",
    "MCW":                                  "Wholesaler A",
    "LWC/60":                               "Wholesaler B",
    "C&D WINES LTD.":                       "Wholesaler C",
}
# Anything not in the map → f"Customer {hash(name) % 1000:03d}" — deterministic.

def anonymize(raw_name: str) -> str:
    if raw_name in ANON_MAP:
        return ANON_MAP[raw_name]
    h = abs(hash(raw_name)) % 1000
    return f"Customer {h:03d}"
```

> The hash uses Python's built-in `hash()` seeded by `PYTHONHASHSEED=42` in `Makefile` / `.env.example` so the anonymized labels are **reproducible across runs**.

The promo file's retailer sheet names (`Tesco`, `Sainsbury's`, `Waitrose `, `Morrisons`, `Asda`) are mapped to the same labels (`Grocer A`–`E`) so the trade-plan view stays consistent with the sales view.

---

## 🧪 ETL pipeline (concrete steps)

```
backend/app/services/etl.py
├── load_sales()         → DATABASE → polars frame, parse dates, extract cliente_id and material_id
├── load_customers()     → CUSTOMERS → filter Pais == 'Reino Unido', anonymize per §5
├── load_materials()     → MaterialData → drop junk cols, normalize codes
├── load_promos()        → 5 per-retailer parsers (see §4), unpivot to long form
├── join_uk_sales()      → sales × customers × materials, split actuals/budget rows
├── build_features()     → lags, rollings, holidays, weather, trends, promo coverage
├── validate()           → Pandera schema
└── snapshot()           → write wide_monthly.parquet, wide_weekly.parquet, promos.parquet
```

### Step 1: parse periods

```python
SPA_MONTH = {"Ene":1,"Feb":2,"Mar":3,"Abr":4,"May":5,"Jun":6,
             "Jul":7,"Ago":8,"Sep":9,"Oct":10,"Nov":11,"Dic":12}

def parse_period(s: str) -> date:
    m, y = s.split(".")
    return date(2000 + int(y), SPA_MONTH[m[:3]], 1)
```

### Step 2: extract numeric join keys

```python
def extract_cliente(s):     # "1/1/91/117738 CARLSBERG..." → 117738
    return int(str(s).split("/")[-1].strip().split()[0])

def extract_material(s):    # "K015600 CERVEZA..." → "K015600"
    return str(s).strip().split()[0]
```

### Step 3: split actuals from budget rows

```python
df = df.with_columns(
    is_actual = pl.col("Hl").is_not_null() & (pl.col("Hl") > 0),
    is_budget = pl.col("Hl").is_null(),
    is_return = pl.col("Hl") < 0,
)
```

The forecaster trains only on `is_actual`. The budget figures (extracted from the same sheet — Damm puts plan rows in there with `Hl=null`) are surfaced via a separate `budgets.parquet`.

### Step 4: net returns

```python
df_net = (
    df.filter(pl.col("Hl").is_not_null())
      .group_by(["cliente_id","material_id","date"])
      .agg(pl.col("Hl").sum(), pl.col("Venta Neta").sum())
)
```

### Step 5: join

```python
sales = (
    df_net
    .join(customers_uk, on="cliente_id", how="inner")     # filters to UK
    .join(materials,    on="material_id", how="inner")    # adds brand, pack info
    .with_columns(sub_channel = pl.col("SubChannel"))
)
```

### Step 6: validation

```python
import pandera.polars as pa
schema = pa.DataFrameSchema({
    "date":         pa.Column(pa.DateTime),
    "material_id":  pa.Column(str),
    "cliente_id":   pa.Column(int),
    "Marca":        pa.Column(str),
    "sub_channel":  pa.Column(str, pa.Check.isin([
        "GROCERY","FREE TRADE CMBC","NATIONAL ON TRADE",
        "FREE TRADE","CONVENIENCE & WHOLESALE","MDD COPACKING"
    ])),
    "Hl":           pa.Column(float, pa.Check.ge(0)),
    "Venta Neta":   pa.Column(float, nullable=True),
})
schema.validate(sales)
```

---

## 4. Per-retailer promo parsers

The promo file sheets each look different. One parser per sheet, dispatched by name.

### `parse_tesco(sheet) -> long_df`

- Headers are in row 0 — event names with `\n` and date ranges (`Mothers Day Sun 15/2 - 15/3`).
- Rows 1+ contain `P1`/`P13` period codes and SKU-level entries.
- Pandas appends `.1`, `.2` to duplicate column headers → split on `.` and strip.
- Steps:
  1. Read with `header=None`.
  2. Find the first column whose value matches `re.match(r"P\d+", str(...))` → that's the period row.
  3. Extract date-range from each column header via regex `(\d{1,2}/\d{1,2})\s*-\s*(\d{1,2}/\d{1,2})`.
  4. Expand to one row per ISO week within the date range, copying the event label.

### `parse_sainsburys(sheet) -> long_df`

- Columns are `Unnamed: N`; the date row is the one whose cells are datetimes.
- The header marker is the cell `New Range` in column ~23.
- Steps:
  1. Find the row whose dtype is `datetime64[us]` → that's the week-start row.
  2. Use that row as the column index; everything below is SKU × event status.
  3. Melt to long.

### `parse_waitrose(sheet) -> long_df`

- Same shape as Sainsbury's but smaller. Reuse the Sainsbury's parser.

### `parse_morrisons(sheet) -> long_df`

- Two-row header: `Unnamed: 1` row = `P3`/`P4` period codes, `Unnamed: 2` row = period start date.
- Row 0 has labels `Start/end`, `Period`, `Key events`.
- Steps:
  1. Anchor on the `Start/end` label in column 0.
  2. Pull the period code from row "Period" and date from row "Start/end".
  3. Each subsequent row is SKU × event status.

### `parse_asda(sheet) -> long_df`

- Columns are `R1`, `R2`, … `R14` (retailer's range cycles).
- Row 0 has date ranges like `01/01-20/01`.
- First column is SKU names.
- Steps:
  1. Read SKU column → use as long-form key.
  2. Parse date ranges from row 0.
  3. Melt and expand to weekly.

### Common output schema

```python
PROMOS_SCHEMA = pa.DataFrameSchema({
    "channel":      pa.Column(str),               # always anonymized retailer label, e.g. "Grocer A"
    "sku":          pa.Column(str, nullable=True),
    "iso_week":     pa.Column(pa.Date),
    "event_label":  pa.Column(str),
    "promo_type":   pa.Column(str, pa.Check.isin([
        "multi-pack","price-cut","feature","display","off-invoice","other"
    ])),
    "discount_pct": pa.Column(float, nullable=True),
    "notes":        pa.Column(str, nullable=True),
})
```

Written to `backend/app/data/snapshots/promos.parquet`.

---

## 5. External enrichment

After the internal join, add these by month (or ISO week for the weekly view):

| Source | Lib | Columns added |
|---|---|---|
| UK bank holidays | `holidays` (PyPI) | `is_holiday_month` (bool), `holidays_count` (int) |
| Open-Meteo (UK avg, no key) | `requests` | `temp_c_mean`, `temp_c_anomaly` |
| Google Trends | `pytrends` | `trends_estrella`, `trends_lager`, `trends_beer` |
| ONS retail sales index | `requests` (ONS API) | `ons_retail_index`, `ons_food_drink_index` |

External fetches are cached to `backend/app/data/cache/{source}.parquet` and only re-pulled if older than 24h.

---

## 6. Output snapshots (what the backend reads at runtime)

```
backend/app/data/snapshots/
├── wide_monthly.parquet     # one row per (sku, sub_channel, month) — primary training table
├── wide_weekly.parquet      # disaggregated, for the GROCERY weekly view
├── promos.parquet           # all retailers, long form
├── budgets.parquet          # extracted from null-Hl DATABASE rows
├── forecast.parquet         # ensemble + reconciled, with p10/p50/p90
├── anomalies.parquet        # STL-flagged historical anomalies
├── promo_roi.parquet        # CausalImpact results per (promo_type, channel)
└── meta.json                # brand, sku, channel value lists for filters
```

All gitignored. Re-creatable from raw via `make data`.

---

## 7. Hero SKU for the demo (data-driven)

**Pinned: `ESTRELLA DAMM × GROCERY`** ([UI label] `Estrella Damm × Off-trade grocery`)

Why this beats every other candidate:

| Criterion | ESTRELLA × GROCERY | Runner-up: ESTRELLA × FREE TRADE CMBC |
|---|---|---|
| UK volume | 519k Hl (40 months) | 728k Hl (40 months) — bigger, but… |
| Number of SKUs to roll up | 30 (good hierarchy showcase) | 47 |
| Promo plan applies? | ✅ yes (Tesco/Sainsbury's/Waitrose/Morrisons/Asda) | ❌ no — B2B distribution |
| What-if simulator works? | ✅ yes | ❌ no |
| Recommendation actionable? | ✅ yes (commercial team can move the lever) | ❌ they don't control CMBC's resale calendar |
| Seasonality story for demo | Strong: Jan trough (-51% vs Mar peak) | Same |

The simulator + recommendation features are the differentiators, and they only function on GROCERY. Hero choice follows from there.

---

## 8. What we do NOT commit

See [.gitignore](.gitignore). Specifically:

```
backend/app/data/raw/                  # the source Excel files
backend/app/data/snapshots/*.parquet   # may contain re-identifiable info
backend/app/data/cache/                # external API responses
*.xlsx *.xls *.csv *.parquet           # belt and suspenders
```

Only ETL code, anonymization map, parsers, schemas, and the README/run instructions are in the repo.
