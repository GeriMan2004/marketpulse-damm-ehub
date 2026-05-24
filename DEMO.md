# Demo

This is the current demo narrative, aligned with the implemented app and the challenge PDF.

## Core Story

The brief asks:

> Will the month close above or below budget/target, why, and what commercial action can close the gap?

Our demo answer:

1. Start from the commercial dashboard.
2. Pick one risky SKU x channel.
3. Show forecast vs derived target.
4. Explain drivers.
5. Show external context and promos.
6. Recommend actions.
7. Simulate a promo/action.

## Suggested Hero Path

Use a grocery SKU because the promo plan is grocery-based.

Example:

```text
http://localhost:3000/decision/EX23SRAN/GROCERY?period=Jul.26
```

## 5-Minute Script

### 1. Dashboard

Open:

```text
http://localhost:3000
```

Say:

```text
The dashboard is a commercial worklist. It ranks where forecasted hL is below target, so the user starts from decisions, not raw data.
```

Show:

- UK pulse
- customer/call workflow
- at-risk drawer or decision link

### 2. Decision Page

Open a SKU/channel decision page.

Say:

```text
This page answers one question: for this SKU and channel, are we above or below target in the selected month?
```

Show:

- Forecast hL
- Target hL
- Gap %
- 80% forecast band

Clarify:

```text
The target is a target estimate generated from historical same-month sales, because the provided Excel did not include a reliable official budget table.
```

### 3. Drivers

Show "Top drivers".

Say:

```text
The drivers come from the LightGBM explainer. They show which signals push the forecast up or down: recent sales, momentum, seasonality, weather, search, retail index, and similar features.
```

### 4. External Context

Show the external context panel.

Say:

```text
The model and UI are enriched with weather, Google Trends, ONS retail index, UK holidays, and curated events. For future months, the UI labels prior-year proxy context clearly.
```

### 5. Promotions

Show promo windows on the chart if present, or open `/promos`.

Say:

```text
Promotions are parsed from the retailer trade plan. They are strongest for GROCERY, so promo impact and promo-aware forecast logic are limited to that channel.
```

### 6. Pick A Play / Recommendations

Show the scenario cards.

Say:

```text
Recommendations are generated from forecast, target, drivers and historical promo ROI. If the LLM is unavailable, the backend has deterministic fallback scenarios, so the demo stays usable.
```

### 7. Simulator

Open the simulate tab.

Say:

```text
The simulator compares the baseline forecast against a proposed promo/action scenario and estimates how much of the gap would close.
```

## What This Proves

| Challenge requirement | Where shown |
|---|---|
| Weekly or monthly forecast | Decision page chart; month/week toggle |
| Compare forecast vs budget/target | KPI cards and gap table logic |
| Clear deviations | Dashboard gap ranking and decision page gap |
| Promotion analysis | `/promos`, promo windows, promo-aware forecast member |
| Explain causes | Top drivers and external context |
| Recommend actions | Pick-a-play cards and `/api/recommend` |
| External sources documented | README, DATA, STACK |
| Working demo | `make demo` |

## Judge Q&A

### Is it budget or revenue?

The forecast target is hL volume, not revenue. GBP is derived later by multiplying hL gap by historical GBP per hL.

### Do we have official budget?

Not reliably in the current source. We implement the brief's "budget or target estimate" by deriving `target_hl` from prior-year same-month actuals and trailing median fallback.

### Are weekly predictions truly trained weekly?

No. Source sales are monthly. Weekly output is a deterministic split of the monthly forecast into ISO weeks.

### Are promotions used?

Yes, but mainly for GROCERY:

- parsed weekly promo plan
- promo windows on charts
- promo-aware Chronos proxy
- promo ROI table
- recommendations use promo ROI context

### Are recommendations hardcoded?

The endpoint first tries the LLM. If that fails, it returns deterministic fallback scenarios. The UI may therefore show fallback-looking cards even though the forecast/gap numbers are real.

### What are the main limitations?

- target is derived, not official budget
- weekly is derived from monthly
- future external data uses prior-year proxy
- promo SKU matching is approximate because retailer promo labels do not share Damm material ids
