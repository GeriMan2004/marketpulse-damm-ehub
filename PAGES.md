# Pages — per-page specification

One section per page. Each section has: hooks, data shape, layout, interactions, states, "Explain this view" payload, and a definition of done.

## 🌐 Global filter contract (pinned)

Every page reads the same topbar filters. **The "channel" filter maps to `CUSTOMERS.SubChannel`** — see [DATA.md §3](DATA.md) for the decision and the 6 allowed values.

| URL param | Meaning | Type | Example | Multi? |
|---|---|---|---|---|
| `brand` | `MaterialData.Marca` | str | `ESTRELLA+DAMM` | no (single brand) |
| `sku` | `MaterialData.Cod. Material` (first token) | str | `K015600` | no |
| `sub_channel` | `CUSTOMERS.SubChannel` | enum | `GROCERY` | no |
| `from` | period start (inclusive) | `YYYY-MM` | `2025-10` | no |
| `to` | period end (inclusive) | `YYYY-MM` | `2026-12` | no |
| `granularity` | `month` (default) or `week` | enum | `week` | no |

Rules:
- Missing filters apply "all" semantics (no constraint on that axis).
- URL is the single source of truth; topbar reads/writes via `useSearchParams`.
- A small Zustand store mirrors the URL for components that need imperative access (e.g. `<ExplainThisView />`).
- Filter changes use `replace`, not `push`, so the back button doesn't fill with history noise.

### Hero deep-link (memorize this for the demo)

```
http://localhost:5173/forecast?brand=ESTRELLA+DAMM&sub_channel=GROCERY&from=2026-04&to=2026-12
```

Reset filter button on the topbar points here.

---

## 1. `/` — Overview

**Goal:** the commercial director should see, in 3 seconds, whether the month is on track and where the biggest gaps are.

### Hooks

```ts
useKpis(filters)              // GET /api/kpis?<filters>
useGapsByMonth(filters)       // GET /api/gap?granularity=month
useTopProblemSkus(filters, 3) // GET /api/gap?sort=gap_pct_asc&limit=3
```

### Data shape (returned)

```ts
type Kpis = {
  total_forecast_hl: number;
  total_budget_hl: number;
  gap_hl: number;
  gap_pct: number;     // signed
  on_track_skus: number;
  off_track_skus: number;
};
```

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│ Topbar: filters                                                │
├────────────────────────────────────────────────────────────────┤
│ [KPI: Forecast]  [KPI: Budget]  [KPI: Gap]  [KPI: SKUs at risk]│
│  NumberTicker     NumberTicker   BadgeDelta  NumberTicker      │
├────────────────────────────────────────────────────────────────┤
│ AreaChart: monthly forecast vs budget (12-month rolling)       │
│            forecast line + 80% interval band + budget line     │
├──────────────────────────────────────┬─────────────────────────┤
│ Top 3 problem SKUs (cards)           │ "Explain this view" btn │
│ each → click drills to /forecast     │                         │
└──────────────────────────────────────┴─────────────────────────┘
```

### Interactions

- Click a problem-SKU card → `navigate('/forecast', { state: { sku, channel } })`
- Filter change in topbar → all hooks refetch (TanStack Query auto-cache by filter key)

### States

- **Loading:** 4 shadcn `<Skeleton />` KPI tiles + chart skeleton
- **Empty (no data for filters):** centered illustration + "Adjust filters to see results"
- **Error:** Sonner toast "Couldn't load overview — retry" with retry button

### Explain-this-view payload

```json
{
  "page": "overview",
  "filters": { "brand": "...", "channel": "...", "period_range": ["Sep.26","Dec.26"] },
  "visible_state": {
    "kpis": { ... },
    "top_problem_skus": [ { "sku": "X", "gap_pct": -0.042 }, ... ]
  }
}
```

### Done

- [ ] 4 KPI tiles with `NumberTicker` animate on mount
- [ ] Monthly chart renders with confidence band
- [ ] Top-3 problem SKUs cards click-through works
- [ ] Filters in URL survive a page refresh
- [ ] Skeletons + error toast tested

---

## 2. `/forecast` — Forecast detail

**Goal:** drill into a specific SKU × channel, see weekly **and** monthly forecast vs budget vs actuals with intervals.

### Hooks

```ts
useForecast({ sku, channel, granularity, horizon })  // GET /api/forecast
useGap({ sku, channel, period_range })               // GET /api/gap
useAnomalies({ sku, channel })                       // GET /api/anomalies
```

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│ Topbar: filters (sku, channel required)                        │
├──────────────────────────────────────────────────────────────-─┤
│ Tabs: [ Month ▸ Week ]                                         │
├────────────────────────────────────────────────────────────────┤
│ Plotly area+line: actual ▪ forecast ▪ budget                   │
│                   shaded 80% & 95% intervals                   │
│                   anomaly markers (red dots) on past points    │
├──────────────────────────────────────┬─────────────────────────┤
│ Gap table (period × forecast × budget│ "Explain this view" btn │
│  × gap_hl × gap_pct × confidence)    │                         │
│  TanStack Table, sortable            │                         │
└──────────────────────────────────────┴─────────────────────────┘
```

### Interactions

- Tab switch month/week → refetches with new `granularity`
- Hover on point → tooltip with Hl, interval, budget delta
- Click an anomaly marker → opens a `<Sheet>` with the anomaly's `candidate_cause`
- Click a row in the gap table → highlights that point on the chart

### States

- **No SKU/channel selected:** empty state with a `<Command>` palette to pick one
- **Loading:** chart skeleton + table skeleton
- **Error:** retry toast

### Explain-this-view payload

```json
{
  "page": "forecast",
  "filters": { "sku": "...", "channel": "...", "granularity": "month" },
  "visible_state": {
    "next_3_months": [ { "period": "...", "forecast_hl": ..., "budget_hl": ..., "gap_pct": ... }, ... ],
    "anomalies_visible": 2
  }
}
```

### Done

- [ ] Month/week tabs both work
- [ ] Confidence band renders correctly under the forecast line
- [ ] Anomaly markers clickable
- [ ] Gap table sortable + linked to chart

---

## 3. `/drivers` — Deviation drivers

**Goal:** for any gap, explain *why* in business language a director understands.

### Hooks

```ts
useDrivers({ sku, channel, period })   // GET /api/drivers
useNarrative({ sku, channel, period }) // GET /api/explain-view (page=drivers)
```

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│ Topbar: filters (sku, channel, period required)                │
├────────────────────────────────────────────────────────────────┤
│ Headline: "Estrella 33cl off-trade · Nov 2026 · -4.2% gap"     │
│ TextAnimate fade-in (once)                                     │
├────────────────────────────────────────────────────────────────┤
│ Plotly SHAP waterfall  ◀──── this is the hero chart            │
│   bars: feature contributions (signed) → final forecast        │
├────────────────────────────────────────────────────────────────┤
│ Narrative: 3 bullets, generated by LLM                         │
│   each bullet ties to one of the top 3 driver bars             │
├──────────────────────────────────────┬─────────────────────────┤
│ Causal evidence panel (collapsed)    │ "Explain this view" btn │
│   tfcausalimpact charts for any      │                         │
│   driver tagged as "promotional"     │                         │
└──────────────────────────────────────┴─────────────────────────┘
```

### Interactions

- Hover a SHAP bar → highlight the corresponding narrative bullet
- Expand causal evidence panel → lazy-load CausalImpact charts
- Period changes via topbar → refetch

### States

- **No selection:** empty state explaining "Pick a SKU, channel and period to see drivers"
- **Loading:** waterfall skeleton + 3 bullet skeletons
- **Error:** toast

### Explain-this-view payload

```json
{
  "page": "drivers",
  "filters": { "sku": "...", "channel": "...", "period": "Nov.26" },
  "visible_state": {
    "drivers": [
      { "feature": "...", "shap_value": -45.2, "direction": "negative" },
      { ... }, { ... }
    ]
  }
}
```

### Done

- [ ] SHAP waterfall renders with positive/negative coloring
- [ ] 3-bullet narrative loads under 2s
- [ ] Hover sync between bars and bullets

---

## 4. `/promos` — Promotion impact

**Goal:** rank promos by ROI and show the causal evidence behind the ranking.

### Hooks

```ts
usePromoRoi(filters)              // GET /api/promos/roi
usePromoCausal(promo_id)          // GET /api/promos/causal/:id
```

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│ Topbar: channel filter optional                                │
├────────────────────────────────────────────────────────────────┤
│ TanStack Table: ranked promos                                  │
│  cols: promo_type · channel · avg_lift_% · avg_lift_Hl ·       │
│        est_cost · ROI · n_obs · confidence                     │
│  highlight top row with BorderBeam-ish ring                    │
├────────────────────────────────────────────────────────────────┤
│ Selected promo detail (right Sheet):                           │
│   Plotly before/after series with intervention line            │
│   counterfactual band (CausalImpact)                           │
│   one-line LLM summary of the lift                             │
└────────────────────────────────────────────────────────────────┘
```

### Interactions

- Click a row → opens detail Sheet, fetches CausalImpact chart
- Sort by any column
- Channel filter → refetches

### States

- **Empty (no past promos for channel):** "No historical promotions in this channel yet."
- **Low confidence rows:** muted text + tooltip explaining `n_obs < 3`

### Explain-this-view payload

```json
{
  "page": "promos",
  "filters": { "channel": "..." },
  "visible_state": { "top_5_by_roi": [ { ... }, ... ] }
}
```

### Done

- [ ] Sortable table with all columns
- [ ] Detail Sheet shows CausalImpact chart
- [ ] Confidence visually conveyed (color/opacity)

---

## 5. `/simulator` — What-if simulator (the killer feature)

**Goal:** let the user change promo parameters with sliders and see the new forecast / new gap update live.

### Hooks

```ts
useBaselineForecast({ sku, channel })   // GET /api/forecast
useSimulate()                           // POST /api/simulate (TanStack mutation)
```

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│ Topbar: sku, channel required                                  │
├──────────────────────────────────┬─────────────────────────────┤
│ Controls (left, ~33%)            │ Output (right, ~66%)        │
│ ┌──────────────────────────────┐ │ ┌─────────────────────────┐ │
│ │ Promo months (multi-select)  │ │ │ AreaChart:              │ │
│ │ Discount %      [slider 0-50]│ │ │   baseline forecast     │ │
│ │ Promo type      [select]     │ │ │   simulated forecast    │ │
│ │ [ ShimmerButton: Simulate ]  │ │ │   budget line           │ │
│ └──────────────────────────────┘ │ └─────────────────────────┘ │
│                                  │ Big BadgeDelta:             │
│                                  │   "Closes 68% of gap"       │
│                                  │ Sub-metrics:                │
│                                  │   est. cost · ROI estimate  │
│                                  │   LLM rationale (1-liner)   │
├──────────────────────────────────┴─────────────────────────────┤
│ "Save as scenario" → seeds the Recommendations page            │
└────────────────────────────────────────────────────────────────┘
```

### Interactions

- Sliders + selects update local form state (react-hook-form + zod)
- Click `Simulate` → POST to `/api/simulate` → right panel updates
- "Save as scenario" → stores `SimulationResult` in MongoDB; appears as a custom scenario on `/recommendations`

### States

- **Baseline loading:** chart skeleton + controls disabled
- **Simulating:** button shows spinner, ShimmerButton dims
- **Error:** toast + keep last successful result visible

### Explain-this-view payload

```json
{
  "page": "simulator",
  "filters": { "sku": "...", "channel": "..." },
  "visible_state": {
    "inputs": { "months": [...], "discount_pct": 10, "promo_type": "multi-pack" },
    "result": { "gap_before_hl": ..., "gap_after_hl": ..., "gap_closed_pct": 0.68 }
  }
}
```

### Done

- [ ] Sliders update form state without re-running on every tick (debounce 200ms or button-triggered)
- [ ] Result chart re-renders with both lines + budget
- [ ] Save-as-scenario actually persists to Mongo

---

## 6. `/recommendations` — 3 scenarios

**Goal:** the commercial director picks one of three concrete plans.

### Hooks

```ts
useRecommend({ sku, channel, period })  // POST /api/recommend
useSavedScenarios()                     // GET /api/scenarios (from simulator)
```

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│ Header: SKU · Channel · Period · Current gap                   │
├────────────────────────────────────────────────────────────────┤
│ Three columns (shadcn Cards):                                  │
│                                                                │
│  ┌─ Conservative ─┐  ┌─ Balanced ★ ─┐  ┌─ Aggressive ─┐        │
│  │ headline       │  │ headline     │  │ headline     │        │
│  │ closes XX%     │  │ closes YY%   │  │ closes ZZ%   │        │
│  │ actions (list) │  │ actions      │  │ actions      │        │
│  │ evidence       │  │ evidence     │  │ evidence     │        │
│  │ risk notes     │  │ risk notes   │  │ risk notes   │        │
│  │ [Adopt ▸]      │  │ [Adopt ▸]    │  │ [Adopt ▸]    │        │
│  └────────────────┘  └──────────────┘  └──────────────┘        │
│                       ▲ BorderBeam on the LLM-recommended one  │
├────────────────────────────────────────────────────────────────┤
│ Custom scenarios saved from /simulator (collapsed list)        │
└────────────────────────────────────────────────────────────────┘
```

### Interactions

- "Adopt" → posts a scenario adoption to Mongo (for the demo: shows a Sonner toast "Action plan generated — copy to clipboard?")
- "Explain this view" returns a different prompt: it explains *why this scenario is recommended* over the others.

### States

- **Loading:** 3 card skeletons in column layout
- **Error:** "Couldn't generate scenarios — show baseline forecast instead" with a button
- **Snapshot mode (offline):** read the canned `HERO_FALLBACK` response

### Explain-this-view payload

```json
{
  "page": "recommendations",
  "filters": { "sku": "...", "channel": "...", "period": "Nov.26" },
  "visible_state": { "scenarios": [ { "label":"conservative", ... }, ... ] }
}
```

### Done

- [ ] Exactly 3 cards always render (Pydantic enforces)
- [ ] Recommended card has `BorderBeam`
- [ ] Adopt button gives feedback (Sonner toast)
- [ ] Custom scenarios from simulator appear below

---

## 7. `/chat` — Agent chat

**Goal:** non-technical user types a question, the agent uses tools and answers with reasoning visible.

### Hooks

```ts
const { messages, input, handleSubmit, isLoading } = useChat({
  api: '/api/chat',
  streamProtocol: 'text-event-stream',  // we emit typed SSE events
});
```

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│ ScrollArea: messages (user + assistant)                        │
│   assistant messages include tool-call chips inline:           │
│     🛠 compare_vs_budget(...) · -120 Hl (-4.2%)                 │
│     🛠 explain_gap(...) · 3 drivers                             │
│   tokens stream into the text region                           │
├────────────────────────────────────────────────────────────────┤
│ [ input textarea ............................. ] [ Send ]      │
└────────────────────────────────────────────────────────────────┘
```

### Interactions

- Enter / Send → POST to `/api/chat` SSE
- Tool-call chip click → opens the relevant page with filters set (deep-link)

### States

- **Streaming:** typing indicator + partial assistant message
- **Tool running:** chip shows "running…" spinner, replaced by `result_summary` on done
- **Error mid-stream:** show what we got + retry button

### Explain-this-view

Not applicable on `/chat` — the chat is already the explanation surface.

### Done

- [ ] SSE events render as typed chips + tokens
- [ ] Tool-call chips deep-link to other pages
- [ ] No flashing / layout shift while streaming
- [ ] Long conversations scroll smoothly (ScrollArea + virtualized if needed)

---

## 🌐 Cross-page wiring

- **Topbar filters** live in a global Zustand store + URL sync. Every page reads from the same store.
- **"Explain this view"** button is a single component that captures `page`, `filters`, and `visible_state` (per page) and POSTs to `/api/explain-view`. The response is rendered in a shadcn `<Sheet>` with the 3 bullets and the suggested action.
- **Snapshot mode:** the API client base URL is swapped to `/snapshots/*.json` via a hidden shortcut. All hooks above work identically against snapshots.
