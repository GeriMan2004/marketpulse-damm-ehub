# MarketPulse UK — Damm × Engineering Hub Hackathon

A tool that forecasts UK sales, detects deviations vs. budget, and recommends commercial actions to close the gap.

## 📚 Docs

- **[CHALLENGE.md](CHALLENGE.md)** — Brief, deliverables, judging criteria
- **[DATA.md](DATA.md)** — Real audit results, ETL, anonymization map, hero SKU decision
- **[ML.md](ML.md)** — Modeling strategy: training plan, ensemble, reconciliation, anomalies, CV
- **[STACK.md](STACK.md)** — Tech stack with rationale, MongoDB collections
- **[AGENT.md](AGENT.md)** — LLM routing (fast Llama / deep Kimi-Instruct / fallback), tools, schemas, snapshot mode
- **[PAGES.md](PAGES.md)** — 7-page spec with pinned filter contract and hero deep-link
- **[FRONTEND.md](FRONTEND.md)** — React build guide (shadcn + Magic UI + Tremor, flat aesthetic)
- **[PLAN.md](PLAN.md)** — 24h execution plan, role split, risks, done checklist
- **[DEMO.md](DEMO.md)** — 5-min hero narrative + judge Q&A + safety net
- **[Makefile](Makefile)** — every `make <target>` documented (install, data, train, demo, snapshot, doctor, types, clean)
- **[.env.example](.env.example)** — required env vars (HF_TOKEN, MONGO_URI, PYTHONHASHSEED)

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

## 🚀 Run

```bash
make doctor       # checks: hf token, uv, pnpm, raw data present, mongo reachable
make install      # backend (uv sync) + frontend (pnpm install)
make data         # raw Excel → snapshots/*.parquet
make train        # fit ensemble, write forecast/anomalies/promo_roi snapshots
make demo         # backend on :8000 + frontend on :5173, interleaved logs
```

Open <http://localhost:5173>. Backend OpenAPI at <http://localhost:8000/docs>.

**One-time prerequisites:**

1. Copy `UK DATA.xlsx` and `Damm Trade Plan - promotions.xlsx` into `backend/app/data/raw/` (gitignored).
2. `hf auth login` with a token that has the **"Make calls to Inference Providers"** permission (fine-grained token, scope it to the `EHubBarcelona` org).
3. `cp .env.example backend/.env` and fill in `HF_TOKEN` if you want it explicit (otherwise `huggingface_hub` reads `~/.cache/huggingface/token`).

See [Makefile](Makefile) for every available target.
