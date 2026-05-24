# Stack

This is the current implemented stack, not the original planning stack.

## Backend

| Area | Tools |
|---|---|
| API | FastAPI, Pydantic v2, Uvicorn |
| Data frames | Polars, PyArrow |
| Excel parsing | OpenPyXL, fastexcel |
| SQL / inspection | DuckDB |
| Validation | Pandera |
| Forecasting | LightGBM, StatsForecast, Chronos, scikit-learn, scipy, statsmodels |
| Explainability | SHAP |
| LLM | Hugging Face `InferenceClient` |
| News | Tavily |
| Environment | python-dotenv |

Python dependencies are defined in:

```text
backend/pyproject.toml
```

## Frontend

| Area | Tools |
|---|---|
| Framework | Next.js 16 App Router |
| UI runtime | React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Components | local shadcn/Radix-style primitives |
| Charts | Recharts |
| Icons | Lucide React |
| Client fetching | SWR for interactive panels |
| API client | openapi-fetch |
| Type generation | openapi-typescript |

Frontend dependencies are defined in:

```text
web/package.json
```

## LLM Profiles

Defined in `backend/app/services/llm.py`.

| Profile | Model | Provider | Used for |
|---|---|---|---|
| `fast` | `meta-llama/Llama-3.3-70B-Instruct` | Groq | chat/explain-style routes |
| `deep` | `moonshotai/Kimi-K2-Instruct` | Novita | `/api/recommend`, `/api/brief` style generation |
| `fallback` | `Qwen/Qwen2.5-72B-Instruct` | HF auto | fallback after provider errors |

Token resolution:

1. `HF_TOKEN` in environment or `backend/.env`
2. `~/.cache/huggingface/token`

## External Data Sources

| Source | Purpose |
|---|---|
| NASA POWER | Weather temperature and anomaly |
| Google Trends via `pytrends` | Search interest |
| ONS JSON APIs | Retail and food/drink index |
| `holidays` package | UK bank holidays |
| Curated `calendar.py` events | Sports/cultural events shown in forecast context |
| Tavily | Optional UK trade/news context |

## Storage

The working storage layer is local Parquet:

```text
backend/app/data/snapshots/*.parquet
backend/app/data/cache/*
```

MongoDB is listed in dependencies and checked by `make doctor`, but the current core app does not depend on MongoDB for the main dashboard flow.

## Backend Endpoints

Current router families:

| Endpoint family | Purpose |
|---|---|
| `/api/meta` | Metadata for labels and filters |
| `/api/kpis` | KPI rollups |
| `/api/forecast` | Monthly or weekly forecast |
| `/api/forecast/timeline` | Aggregate timeline |
| `/api/forecast/by-brand` | Brand rollups |
| `/api/forecast/by-sub-channel` | Sub-channel rollups |
| `/api/pulse` | UK pulse summary |
| `/api/gap` | Forecast vs target gaps |
| `/api/drivers` | SHAP driver rows |
| `/api/simulate` | What-if simulation |
| `/api/promos/roi` | Promotion ROI table |
| `/api/recommend` | Scenario recommendations |
| `/api/explain-view` | LLM explanation of visible state |
| `/api/chat` | Chat route |
| `/api/anomalies` | Historical anomaly flags |
| `/api/external-signals` | Weather/search/retail/calendar context |
| `/api/pricing/gross-per-hl` | GBP per hL approximations |
| `/api/news` | Cached market-pulse news |
| `/api/admin/refresh-news` | Refresh news cache |
| `/api/brief` | Customer brief generation |
| `/api/debug/parquet` | Snapshot inspection |

## Dev Tooling

| Task | Tool |
|---|---|
| Python env | `uv` |
| JS packages | `pnpm` |
| Backend server | `uvicorn` |
| Types from OpenAPI | `openapi-typescript` |
| Web lint | `eslint` |
| Python lint config | `ruff` |
| Commands | `Makefile` |
