# MarketPulse UK — Damm × Engineering Hub Hackathon

A tool that forecasts UK sales, detects deviations vs. budget, and recommends commercial actions to close the gap.

## 📚 Docs

- **[CHALLENGE.md](CHALLENGE.md)** — What the brief asks for, deliverables, judging criteria
- **[DATA.md](DATA.md)** — Source files, columns, ETL plan, anonymization rules
- **[STACK.md](STACK.md)** — Tech stack with reasoning per layer
- **[AGENT.md](AGENT.md)** — Agent design: Kimi K2.6 + smolagents tools + Pydantic schemas + prompts
- **[PAGES.md](PAGES.md)** — Per-page spec for the 7 frontend pages
- **[FRONTEND.md](FRONTEND.md)** — React frontend details (shadcn, Magic UI, Tremor)
- **[PLAN.md](PLAN.md)** — 24h execution plan with hour-by-hour timeline
- **[DEMO.md](DEMO.md)** — Demo narrative and rehearsal script

## 🎯 One-line pitch

> We don't just forecast sales — we explain *why* the forecast misses budget and tell the commercial team **exactly what to do about it**.

## 🏗️ Architecture at a glance

```
┌─────────────────────────────────────────────────────────────┐
│  React frontend (Vite + TS)                                 │
│  shadcn/ui · Magic UI · Tremor · TanStack Query            │
│  Pages: Overview · Forecast · Drivers · Promos · Simulator │
│         Recommendations · Chat                              │
└────────────────────────┬────────────────────────────────────┘
                         │  REST + SSE (typed via OpenAPI)
┌────────────────────────▼────────────────────────────────────┐
│  FastAPI backend                                            │
│  /forecast · /gap · /drivers · /simulate · /promos/roi      │
│  /recommend · /chat (SSE stream)                            │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   Forecast layer  Explanation layer   Recommendation layer
   ─────────────   ──────────────────  ──────────────────────
   MLForecast      SHAP                What-if simulator
   + LightGBM      (deviation          Promo ROI ranking
   StatsForecast   drivers)            smolagents + Llama-3.3
   AutoARIMA       tfcausalimpact      Instructor (3 scenarios)
   Chronos-Bolt    (promo lift)
   (HF Inference)  Anomaly detection
   + hierarchical
   reconciliation
        ▲
        │
        │ Parquet / MongoDB (via MCP)
        │
   ┌────┴─────────────────────────────────────────────────┐
   │  Polars + DuckDB ETL                                 │
   │  + external signals: weather · UK holidays · trends  │
   └──────────────────────────────────────────────────────┘
```

## 🚀 Run (target structure)

```bash
# Backend
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
pnpm install
pnpm dev
```

Open `http://localhost:5173`. Backend at `http://localhost:8000` with `/docs` for OpenAPI.

(Detailed run instructions land here once the repo is built.)
