# Pages

This document describes the current Next.js app.

## Route Map

| Route | Purpose | Main endpoints |
|---|---|---|
| `/login` | Demo login page | frontend only |
| `/` | Commercial dashboard / workflow inbox | `/api/gap`, `/api/meta`, `/api/pulse`, aggregate forecast endpoints, `/api/news` |
| `/decision/[sku]/[channel]` | Forecast diagnosis, recommendations, simulation | `/api/forecast`, `/api/drivers`, `/api/external-signals`, `/api/recommend`, `/api/explain-view`, `/api/simulate` |
| `/promos` | Promotion ROI reference table | `/api/promos/roi` |
| `/brief` | Briefing workflow landing page | local state + links |
| `/brief/[customer]` | Customer meeting brief | `/api/brief` |

There is currently no frontend Parquet browser page. Parquet inspection is backend-only via `/api/debug/parquet`.

## `/`

Main files:

- `web/src/app/(app)/page.tsx`
- `web/src/components/inbox/*`
- `web/src/components/market-pulse/NewsCard.tsx`

Purpose:

- show the UK commercial pulse
- surface customers/SKUs at risk
- show upcoming call workflow
- connect the user to decision pages

Important components:

- `UkPulseHero`
- `RollupChips`
- `MonthCalendar`
- `UpcomingCalls`
- `AtRiskDrawer`
- `CustomerFilter`
- `NewsCard`

Data:

- gaps from `/api/gap`
- metadata from `/api/meta`
- pulse/rollups from aggregate endpoints
- news from `/api/news`

## `/decision/[sku]/[channel]`

Main files:

- `web/src/app/(app)/decision/[sku]/[channel]/page.tsx`
- `diagnosis-panel.tsx`
- `options-panel.tsx`
- `simulate-panel.tsx`
- `web/src/components/charts/ForecastChart.tsx`
- `web/src/components/charts/ExternalSignals.tsx`

URL:

```text
/decision/EX23SRAN/GROCERY?period=Jul.26
/decision/EX23SRAN/GROCERY?period=Jul.26&granularity=week
/decision/EX23SRAN/GROCERY?period=Jul.26&tab=simulate
```

### Diagnosis view

Shows:

- Forecast hL
- Target hL
- Gap %
- Forecast chart with 80% interval
- promo windows if available
- calendar event markers
- top drivers
- external context
- "Pick a play" scenario cards

Important note:

- Forecast and target numbers are real backend outputs.
- The scenario cards come from `/api/recommend`; if the LLM fails, the backend returns deterministic fallback scenarios.

### Options view

Fetches `/api/recommend` and shows conservative/balanced/aggressive scenarios in more detail.

### Simulate view

Client component.

Lets the user choose:

- promo months
- promo type
- discount

Then posts to `/api/simulate` and renders baseline vs simulated forecast.

## `/promos`

Main file:

- `web/src/app/(app)/promos/page.tsx`

Current UI:

- compact ROI table
- one sparkline per promo type
- no promo-story card currently

Endpoint:

- `/api/promos/roi`

Fields shown:

- promo type
- avg lift %
- trend sparkline
- avg lift hL
- estimated cost
- ROI
- observations
- confidence

## `/brief`

Main files:

- `web/src/app/(app)/brief/page.tsx`
- `web/src/app/(app)/brief/[customer]/page.tsx`

Purpose:

- prepare a customer-call brief
- combine gap/forecast context with LLM-generated text

Endpoint:

- `/api/brief`

## Shared UI

| Component area | Files |
|---|---|
| Shell/sidebar | `web/src/components/shell/*` |
| Charts | `web/src/components/charts/*` |
| UI primitives | `web/src/components/ui/*` |
| API/types | `web/src/lib/api.ts`, `web/src/lib/api.gen.ts` |
| Labels/formatting | `web/src/lib/meta.ts`, `web/src/lib/format.ts`, `web/src/lib/driver-labels.ts` |
| Recent decision state | `web/src/lib/hooks/useRecentDecisions.ts` |
| Brief history | `web/src/lib/hooks/useBriefHistory.ts` |

## Design Notes

- The UI is action-first: surface what needs attention, then explain why.
- Numbers are hL first, GBP second.
- Customer and retailer names must remain anonymized.
- `SubChannel` is the app's channel dimension.
- Weekly forecast is a view of the monthly forecast, not a separate model.
