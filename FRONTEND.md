# Frontend — Dub.co-style analytics dashboard

> **Status: ✅ all 7 pages live**, multi-page router shell with persistent sidebar.
> **UI pattern: Dub.co's analytics page** ([app.dub.co](https://app.dub.co)). Sticky filter bar → KPI tiles → main chart → breakdown tables. See [DECISIONS.md D-018](DECISIONS.md) for the pivot rationale.

## The Dub pattern, applied to our domain

Every page that shows aggregated data follows the same composition:

```
┌─────────────────────────────────────────────────────────────────┐
│ PAGE TITLE + period range                                        │
├─────────────────────────────────────────────────────────────────┤
│ STICKY FILTER BAR     Brand chip · Sub-channel chip · SKU chip   │
│                       URL-synced, clear-filters link             │
├─────────────────────────────────────────────────────────────────┤
│ KPI ROW               4 slim tiles in a horizontal row           │
├─────────────────────────────────────────────────────────────────┤
│ MAIN CHART            Recharts time-series, area+line composed   │
├─────────────────────────────────────────────────────────────────┤
│ TWO-COLUMN BREAKDOWN  Problem-SKU table  |  Sub-channel bar      │
├─────────────────────────────────────────────────────────────────┤
│ LLM STORY CARD        3-bullet exec summary + next action        │
└─────────────────────────────────────────────────────────────────┘
```

This is the exact shape of Dub.co's `/analytics` page — filter chips, metric tiles, main chart, breakdown tables. CPG users recognize it instantly because it's the same composition Tableau / Looker / Mixpanel use.

## Why this shape works for a commercial director

| Section | What the user looks at | What they do next |
|---|---|---|
| Filter bar | Already-applied dims (chip says "Sub-channel · Off-trade grocery") | Click a chip to re-cut |
| KPI row | Are we OK overall? (4 numbers in 2 seconds) | If gap → scroll for detail |
| Main chart | When are we drifting? (line vs target over time) | Hover a month, drill in |
| Problem-SKU list | Which specific SKUs caused the drift? | Click row → /forecast for that SKU |
| Sub-channel bar | Which channel is the worst leak? | Click bar → filter to that channel |
| LLM story | Plain-English answer for the mobile reader | Follow the suggested next action |

Every interaction stays on the same page — only the filters change. When a user wants depth on a single SKU, they click through to `/forecast?sku=...` which is the same Dub-shape (filter bar + KPIs + chart + table) but scoped to one SKU.

## Three layers, always in this order

```
LAYER 1 — ANSWER       Forecast vs target. The KPI row + main chart answer this.
LAYER 2 — EVIDENCE     Per-month gap table, anomaly markers, SHAP drivers.
LAYER 3 — OPTIONS      Simulator (live re-prediction) + 3-scenario LLM recommendations.
```

The sidebar nav maps each page to one of three questions, surfaced as one-line hints:

| Page | Question |
|---|---|
| `/` Overview | Where's the gap? |
| `/forecast` | What does the model predict for a SKU? |
| `/drivers` | Why is the gap there? |
| `/promos` | What's worked before? |
| `/simulator` | What if we change things? |
| `/recommendations` | What should we do? |
| `/chat` | Conversational deep-dive |

## Chart library: Recharts (same as Dub)

We removed Plotly entirely — it broke twice in production with CJS/ESM interop issues (see [D-018](DECISIONS.md)). Recharts is what Dub uses, what shadcn templates assume, and it cuts the JS bundle from **5.2 MB → 968 KB**.

Four chart components live in `frontend/src/components/charts/`:

- `ForecastAreaChart.tsx` — main time-series with 80% PI shaded band
- `GapByChannelChart.tsx` — horizontal bars colored by gap %
- `DriversWaterfall.tsx` — SHAP horizontal bars, signed colors
- `SimulatorChart.tsx` — baseline vs simulated overlaid lines

## Label translation everywhere

Raw codes (`EX23SRAN`, `GROCERY`, `Nov.26`) never appear in front of users. The backend's `meta.json` carries human labels (`Estrella Damm · 660ml nr bottle`, `Off-trade grocery`, `November 2026`); the frontend's `format.ts` handles client-side rendering (Hl, percent, GBP). See [DECISIONS.md D-016](DECISIONS.md).

## LLM narrative on top of every key view

Charts are evidence; the LLM-generated sentence on top is the answer. A director scrolling on mobile gets the headline without having to interpret a chart. The story card calls `/api/explain-view` with the current filters + visible state and renders the 3 bullets + suggested next action.

---

## 🧱 Stack snapshot

| Concern | Pick | License |
|---|---|---|
| Framework | **Vite + React 18 + TypeScript** | MIT |
| Styling | **Tailwind CSS** (dark mode default) | MIT |
| Primitives | **shadcn/ui** | MIT |
| Subtle animations | **[Magic UI](https://magicui.design/)** (flat components only) | MIT |
| Dashboard kit | **Tremor** (cards, KPIs, default charts) | Apache-2.0 |
| Custom charts | **Plotly.js** (SHAP waterfall, confidence bands) | MIT |
| Tables | **TanStack Table** + shadcn `Table` styling | MIT |
| Data fetching | **TanStack Query** + **openapi-fetch** | MIT |
| Chat | **Vercel AI SDK `useChat`** (SSE) | Apache-2.0 |
| Icons | **lucide-react** | ISC |
| Motion | **Framer Motion** (subtle only) | MIT |
| Toasts | **Sonner** | MIT |
| Forms | **react-hook-form** + **zod** | MIT |
| Routing | **react-router-dom v6** | MIT |

---

## 🎨 Visual direction

- **Theme:** dark by default (`zinc-950` bg), Damm-red accent (`#e30613`-ish), Inter or Geist font.
- **Tone:** Linear / Vercel / Tremor demo — flat, high-contrast, generous whitespace.
- **Layout:** left sidebar nav (collapsible) + topbar with brand/SKU/channel/period filters + main content area.
- **Motion budget (strict):**
  - Page-enter: 150ms fade
  - KPI numbers: count-up on mount
  - Card hover: 1px border lighten, no transform
  - "Recommended" scenario card: subtle `BorderBeam` accent (2D animated border)
  - That's it. Nothing else moves.

---

## 🗺️ Page map

| # | Route | Purpose | Key components |
|---|---|---|---|
| 1 | `/` | **Overview** — KPIs + monthly forecast vs budget chart + 3 problem SKUs | Tremor `<Card>`, `<Metric>`, `<BadgeDelta>`, `<AreaChart>`; Magic UI `NumberTicker` for KPI numbers |
| 2 | `/forecast` | **Forecast detail** — drill brand → SKU → channel with intervals | Custom Plotly area + confidence band; shadcn `<Tabs>` for granularity (week/month) |
| 3 | `/drivers` | **Deviation drivers** — SHAP waterfall + narrative | Plotly waterfall; Magic UI `TextAnimate` for the narrative paragraph |
| 4 | `/promos` | **Promo impact** — causal lift charts + ROI table | Plotly per-promo before/after; TanStack Table with shadcn styling |
| 5 | `/simulator` | **What-if simulator** — sliders → re-forecast → new gap | shadcn `<Slider>`, `<Select>`; Tremor `<AreaChart>` re-renders on submit; Magic UI `ShimmerButton` on "Simulate" |
| 6 | `/recommendations` | **3 scenarios** — conservative / balanced / aggressive | shadcn `<Card>` × 3, recommended one wrapped in Magic UI `BorderBeam`; "Explain this view" button |
| 7 | `/chat` | **Agent chat** — streaming, with tool-call breadcrumbs | Vercel AI SDK `useChat`; shadcn `<ScrollArea>` |

---

## 🧩 Magic UI picks (flat only)

Pick **3–4 things max**. Resist the urge to use every component.

- **`NumberTicker`** — animated count-up on every KPI tile. Instantly "feels expensive", no movement once settled.
- **`TextAnimate`** — page heading on `/drivers` and the narrative paragraph. Single fade-in per page load.
- **`BorderBeam`** — subtle animated border on the recommended scenario card. Draws the eye without screaming.
- **`ShimmerButton`** — the "Simulate" CTA on `/simulator`. A small shine, no scale/rotation.
- **`Marquee`** *(optional)* — slow, single-row data-sources logo strip in the footer.

**Explicitly NOT using:**
- ❌ 3D tilt / parallax cards
- ❌ Aurora / animated WebGL backgrounds
- ❌ Cursor trails, spotlight followers
- ❌ Auto-scrolling carousels
- ❌ Page-wide motion on filter changes

---

## 🛠️ Bootstrap commands

```bash
# Scaffold
pnpm create vite@latest frontend -- --template react-ts
cd frontend
pnpm install
pnpm add tailwindcss postcss autoprefixer
pnpm dlx tailwindcss init -p

# shadcn
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card tabs slider select sheet \
  command dropdown-menu sonner scroll-area badge separator skeleton table

# Magic UI (flat components only, via shadcn registry)
pnpm dlx shadcn@latest add "https://magicui.design/r/number-ticker.json"
pnpm dlx shadcn@latest add "https://magicui.design/r/text-animate.json"
pnpm dlx shadcn@latest add "https://magicui.design/r/border-beam.json"
pnpm dlx shadcn@latest add "https://magicui.design/r/shimmer-button.json"
pnpm dlx shadcn@latest add "https://magicui.design/r/marquee.json"

# Tremor
pnpm add @tremor/react

# Charts + tables
pnpm add plotly.js react-plotly.js @tanstack/react-query @tanstack/react-table

# AI / chat
pnpm add ai

# Forms + utils
pnpm add react-hook-form zod @hookform/resolvers react-router-dom lucide-react sonner

# Motion (peer for Magic UI)
pnpm add framer-motion

# Typed API client
pnpm add -D openapi-typescript
pnpm add openapi-fetch
```

---

## 🔌 API client setup

```ts
// frontend/src/lib/api.ts
import createClient from "openapi-fetch";
import type { paths } from "./api.gen"; // generated from FastAPI's openapi.json

export const api = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:8000",
});
```

Regenerate types whenever the backend changes:

```bash
pnpm openapi-typescript http://localhost:8000/openapi.json -o src/lib/api.gen.ts
```

---

## 🗂️ Suggested folder layout

```
frontend/
  src/
    app/                  # router setup, layouts, providers
    pages/
      Overview.tsx
      Forecast.tsx
      Drivers.tsx
      Promos.tsx
      Simulator.tsx
      Recommendations.tsx
      Chat.tsx
    components/
      ui/                 # shadcn + magic-ui (all live here)
      charts/             # Plotly wrappers
      kpi/                # KPI tile using NumberTicker
      sidebar/
      filters/            # brand/SKU/channel/period selectors
      explain-this-view.tsx
    lib/
      api.ts
      api.gen.ts
      query-client.ts
    hooks/
      use-forecast.ts
      use-gap.ts
      use-drivers.ts
      use-simulate.ts
      use-recommend.ts
    styles/
      globals.css
```

---

## 🧪 Skeleton-states & demo safety

- Every fetch hook returns `<Skeleton />` while loading (shadcn `Skeleton`).
- Wrap each page in a `<Suspense>` boundary and an `<ErrorBoundary>` showing a friendly toast on error.
- Demo data is **pre-computed at H22**: the backend reads pre-baked Parquet/Mongo snapshots, no live HF call during the live demo (chat is the only exception — it has a stub fallback).
- The frontend **always** calls the live backend. No static-JSON fallback. If the backend is down it's a real error, surfaced via a Sonner toast.

---

## ⏱️ Hour-by-hour for the frontend dev

| Hours | Task |
|---|---|
| H12–H13 | Bootstrap Vite + Tailwind + shadcn + Tremor; theme + sidebar + router shell |
| H13–H14 | Stub all 7 pages with placeholder data; wire openapi-fetch + TanStack Query; first API call works |
| H14–H16 | Overview + Forecast pages with real data; KPI tiles with `NumberTicker` |
| H16–H18 | Drivers (Plotly SHAP + `TextAnimate`) + Promos (causal charts + ROI table) |
| H18–H20 | Simulator (sliders + `ShimmerButton`) + Recommendations (3 shadcn cards, `BorderBeam` on recommended) |
| H20–H21 | Chat page (`useChat` against `/api/chat` SSE); "Explain this view" button across pages |
| H21–H22 | Polish: skeletons, empty states, projector-resolution check, favicon, footer with data sources |
| H22–H24 | Rehearse; harden the hero SKU path; record backup video |

---

## ✅ Done checklist (frontend slice)

- [ ] Dark theme + Damm-red accent + Inter/Geist font
- [ ] Sidebar nav with active state
- [ ] Brand/SKU/channel/period filters in topbar (persist across pages)
- [ ] All 7 pages render real data from the FastAPI backend
- [ ] KPI tiles animate (NumberTicker) and show delta vs budget
- [ ] Forecast chart shows actual + forecast + interval band
- [ ] SHAP waterfall renders for any selected gap
- [ ] Simulator slider re-runs forecast and shows new gap closure %
- [ ] Recommendations page shows 3 scenarios; recommended one has `BorderBeam`
- [ ] Chat streams responses with visible tool-call breadcrumbs
- [ ] "Explain this view" button works on every data page
- [ ] Loading skeletons everywhere; no white flashes
- [ ] LICENSE / attribution notes in README for shadcn, Magic UI, Tremor
- [ ] Backup video recorded
