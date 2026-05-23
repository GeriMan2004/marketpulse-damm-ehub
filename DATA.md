# Data — sources, shape, ETL

> Damm data is **confidential**. The Excel files **must not** be committed to this public repo. See `.gitignore`.
> Real file location (local only): `~/Downloads/Repte internacional/`.

---

## 📁 Files we have

| File | Size | Sheets |
|---|---|---|
| `UK DATA.xlsx` | 4.2 MB | `MaterialData`, `CUSTOMERS`, `DATABASE` |
| `Damm Trade Plan - promotions.xlsx` | 400 KB | `Tesco`, `Sainsbury's`, `Waitrose`, `Morrisons`, `Asda`, … |

Place them under `backend/app/data/raw/` locally. Path is gitignored.

---

## 🗃️ `UK DATA.xlsx`

### Sheet `DATABASE` — sales fact table

**25,714 rows.** This is the truth.

| Column (raw) | Meaning | Type | Use |
|---|---|---|---|
| `AÑO CALENDARIO` | Period, Spanish abbrev e.g. `Abr.25`, `Ago.25`, `Ene.26` | str | **TIME** (monthly) |
| `Cod. Cliente` | Customer code, e.g. `1/1/91/117738` | str | join → CUSTOMERS |
| `Cod. Material` | SKU code, e.g. `K015600 CERVEZA...` | str | join → MaterialData |
| `Hl` | Hectoliters sold | float | **TARGET (volume)** |
| `Ventas Brutas` | Gross sales | float | revenue |
| `Bonif.` | Bonifications / rebates | float | |
| `Venta Neta` | Net sales (revenue) | float | secondary target |
| `IIEE` | Excise tax | float | |
| `PVE` | "Precio Venta Estándar" | float | |
| `Otros Imp.` | Other taxes | float | |
| `VN después impto.` | Net after tax | float | |
| `CEL` | Cost ELaboración (production cost) | float | for margin/ROI |
| `CEP` | Cost packaging | float | for margin/ROI |
| `Margen Bruto` | Gross margin | float | for ROI |
| `Mktg Fund` | Marketing fund | float | |
| `MB Comercial + Mkt Fund` | Margin commercial + mkt fund | float | |
| `Negocio` | Business unit | str | |

### Sheet `MaterialData` — SKU master

**2,985 rows.** Joined on `Cod. Material`.

Useful columns:
- `Marca` — brand (e.g. Estrella, Daura, Voll-Damm)
- `Tipo Negocio` — business type
- `Línea Negocio` (`Cerveza`, `Refrescos`) — line of business
- `Tipo Envase` — package type
- `PACK TYPE`, `PACK SIZE` — e.g. `CAN`, `330ML CAN`
- `ALC. %`, `L por SKU` — alcohol %, litres per SKU
- `Business Brands`, `NEW NEGOCIO` — brand groupings

Columns `Unnamed: 22-24` are junk → drop in ETL.

### Sheet `CUSTOMERS` — customer master

**232 rows.** Joined on `Cod. Cliente`.

Useful columns:
- `Pais` — country (filter to **`Reino Unido`** for UK pilot)
- `Sales Channel` — channel (e.g. `MDD CO-PACKING`, off-trade grocery, etc.)
- `SubChannel` — sub-channel
- `Agrupacion`, `Agrupacion BU3`, `Agrupacion BU4` — customer groupings; map to anonymized channel names for the demo
- `Account Manager`, `BDM`, `Jefe de zona` — internal owners (don't surface in demo)
- `ZONA VENTA`, `Cuadrante Export` — geo

**Anonymization rule:** never display the literal `Agrupacion` value in the UI. Map every retailer to a generic label (`off-trade grocery`, `discount`, `premium grocery`, `convenience`) via a dictionary kept in `backend/app/services/anonymize.py`.

---

## 🗃️ `Damm Trade Plan - promotions.xlsx`

One sheet per retailer (`Tesco`, `Sainsbury's`, `Waitrose`, `Morrisons`, `Asda`, possibly more). The five named retailers map to our **channels** for the promo dimension.

### Shape

Wide, hand-maintained Excel. Columns are event windows with date ranges in the header (e.g. `"Mothers Day Sun 15/2 - 15/3"`, `"World Cup 22/6 - 19/7"`). Sub-columns sometimes appear as `.1`, `.2` Pandas-deduped duplicates. Rows contain promo periods (`P1`, `P13`, etc.), event labels and SKU-level entries.

**Pain points:**
- Newlines embedded in column headers (`\n`)
- Mixed date formats: ISO datetimes, free-text ranges, week numbers
- "Period" codes (`P1`…`P13`) vary by retailer's fiscal calendar
- Some sheets pivot the other way (Asda has `R1`, `R2`… as column letters)

### ETL strategy

1. **Read each sheet** with `header=None`, then detect the header rows manually (look for the first row containing the string `Start/end` or a recognizable date).
2. **Melt** wide → long: one row per `(retailer, sku, week_start, week_end, event_label, promo_type)`.
3. **Normalize date ranges:** parse `dd/mm` text into ISO weeks; expand multi-week events into one row per ISO week.
4. **Map retailer → anonymized channel** (`Tesco` → `off-trade grocery A`, etc. — use a stable hash so the demo is reproducible).
5. **Output:** `promos.parquet` with schema:

```
channel: str
sku: str | null   # null = retailer-wide event
iso_week: date    # Monday
event_label: str  # "Mothers Day", "World Cup", "Christmas & Trade"
promo_type: str   # "multi-pack" | "discount" | "feature" | "display" | "other"
discount_pct: float | null
notes: str | null
```

---

## ⏱️ Time granularity decision

The sales data is **monthly** (`Abr.25`, `Ago.25`…). The promo plan is **weekly** (ISO weeks per retailer). The brief says weekly **or** monthly is fine.

Plan:
- **Primary forecast: monthly.** Direct, no disaggregation needed. Use the full DATABASE history (claimed since 2023).
- **Secondary: weekly.** Allocate the monthly forecast into ISO weeks using:
  - Equal-share baseline (Hl per week = Hl per month / number of weeks)
  - **Adjusted by the promo plan**: weeks with a promo get a +x% share factor learned from past months where the same promo type ran.
- The frontend toggles month/week with the `<Tabs>` on `/forecast`.

---

## 🧹 Cleaning checklist

- [ ] Parse `AÑO CALENDARIO` (`Abr.25`) → `date` (1st of month) and `period_str` (canonical `YYYY-MM`).
- [ ] Filter `CUSTOMERS` to `Pais == "Reino Unido"` only; pass the resulting `Cod. Cliente` set as the customer filter on `DATABASE`.
- [ ] Join `DATABASE` × `MaterialData` (Cod. Material) × `CUSTOMERS` (Cod. Cliente). Drop rows where the join fails (orphan codes happen).
- [ ] Drop `MaterialData.Unnamed: 22-24` and any all-null columns.
- [ ] Map `Agrupacion` / retailer → anonymized channel label.
- [ ] Pivot/normalize the promo file → `promos.parquet`.
- [ ] Validate the final wide weekly frame with Pandera (`sku`, `channel`, `iso_week`, `hl`, `revenue`, plus promo/feature columns).
- [ ] Snapshot to `backend/app/data/snapshots/wide_weekly.parquet`.

---

## 🌍 External enrichment joins

After the internal clean, join these in by `iso_week` (or month):

| Source | Key | Columns | Notes |
|---|---|---|---|
| `holidays` (UK) | iso_week | `is_holiday_week`, `holiday_name` | Free PyPI package |
| Open-Meteo (UK avg) | iso_week | `temp_c_mean`, `temp_c_anomaly` | Free, no key |
| Google Trends (`pytrends`) | iso_week | `trends_estrella`, `trends_lager`, `trends_beer` | Brand + category |
| ONS retail sales index | month | `ons_retail_index`, `ons_food_drink_index` | Free API |
| FRED (optional) | month | `uk_cpi`, `uk_consumer_conf` | Free |

---

## 🚫 What we do NOT commit

```gitignore
# Damm data — confidential
backend/app/data/raw/**
backend/app/data/snapshots/**.parquet

# But DO commit:
!backend/app/data/snapshots/.gitkeep
!backend/app/data/raw/.gitkeep
```

The repo holds **schemas, ETL code, and pre-baked anonymized demo snapshots** if needed for the demo, but never the source spreadsheets.
