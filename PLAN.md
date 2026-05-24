# Current Project Plan

This file now tracks the implemented state and remaining practical work. The original hour-by-hour hackathon plan has been superseded by the current codebase.

## Current Status

| Area | Status | Notes |
|---|---|---|
| ETL | Implemented | Raw Excel files become Parquet snapshots through `make data` |
| Forecasting | Implemented | 11-step training pipeline through `make train` |
| Dashboard | Implemented | Current UI is Next.js under `web/` |
| Decision page | Implemented | Forecast, drivers, external context, recommendations, simulator |
| Promos | Implemented, simple | ROI table only; no dense promo-story UI currently |
| Weekly view | Implemented as derived view | Monthly forecast split into ISO weeks |
| Budget comparison | Implemented as target estimate | `targets.parquet`, not official budget |
| External context | Implemented | Weather, Trends, ONS, holidays/events, news |
| Parquet inspection | Backend only | `/api/debug/parquet`, no frontend page |

## What The Demo Should Emphasize

The challenge PDF asks for:

1. weekly and/or monthly forecast
2. forecast vs budget/target comparison
3. deviation detection
4. promotion impact analysis
5. commercial recommendations
6. documented external sources
7. working executable demo

The current app covers these through:

- `/`: commercial workflow dashboard
- `/decision/[sku]/[channel]`: forecast vs target, drivers, external context, recommendations, simulation
- `/promos`: historical promotion ROI
- `/brief`: customer brief generation

## Known Truths To Say Clearly

- Main forecast target is monthly hL.
- Weekly is a deterministic split of monthly forecasts.
- Budget is a derived target estimate because no clean official budget is consumed.
- Promotions are strongest/most valid for `GROCERY`.
- Recommendations may be LLM-generated or deterministic fallback.
- Customer and retailer names are anonymized.

## Remaining High-Value Improvements

| Priority | Work | Why |
|---|---|---|
| P1 | Add a frontend Parquet/debug viewer | User has asked for visual Parquet inspection before |
| P1 | Make the promo page less dense with a single clear impact story | Easier to explain promo value in the demo |
| P1 | Add explicit "target estimate" label/tooltips in UI | Avoid implying official budget |
| P2 | Improve `/api/recommend` fallback so cards do not look generic | Current fallback can look hardcoded |
| P2 | Add more visible CV/accuracy panel | Judges may ask how reliable forecasts are |
| P2 | Tighten CORS config for `localhost:3000` if browser-side API calls need backend origin | Current main CORS list still references old 5173 origin |
| P3 | Add tests around debug endpoints and promo ROI | Reduces demo risk |

## Runbook

Fresh data/training:

```bash
make data
make train
make types
make demo
```

Frontend checks:

```bash
cd web
pnpm exec tsc --noEmit
pnpm lint
```

Backend smoke checks:

```bash
curl http://localhost:8000/healthz
curl http://localhost:8000/api/debug/parquet
curl "http://localhost:8000/api/forecast?sku=EX23SRAN&sub_channel=GROCERY"
```
