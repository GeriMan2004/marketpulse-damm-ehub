# Demo narrative — MarketPulse UK

> Most teams will show features. We show **a story**: one brand, one channel, one decision. 90 seconds end-to-end, then dives if time.
>
> **Hero is pinned: `Estrella Damm × Off-trade grocery`** (raw: ESTRELLA DAMM × GROCERY). 519k Hl over 40 months, 30 SKUs, 5 retailer promo calendars active. The simulator only works on this channel — story follows the data.

---

## 🎬 The hero story (5-minute live demo)

### Setup (15s)
> *"Damm sells in the UK across pubs, supermarkets, distributors. The commercial team tracks sales-vs-budget in Excel with notes on promotions. They want to know — for each brand and SKU — whether the month will close above or below budget, **why**, and **what to do** if it's going to miss. That's MarketPulse UK."*

### Act 1 — The problem (45s) · Overview page
> *"Here's the next 9 months of forecast across all UK SKUs — that's Apr to Dec 2026. The dashboard immediately surfaces three problem zones. The biggest one: **Estrella Damm in off-trade grocery is projected to come in roughly 4% below budget in November**."*

Click the problem-SKU tile → drill into `/forecast`.

> *"The line chart shows actuals — 3 years of monthly data — plus the forecast and the budget line. The grey band is our 80% prediction interval. Notice the structural pattern: **every January is a trough, every March is a peak**, 2-to-1 ratio. That's the UK beer cycle, and our model has learnt it. The gap appears in November."*

### Act 2 — The *why* (60s) · Drivers page
> *"Why is November below budget? We run SHAP on our LightGBM forecaster. The top three drivers, in order: **lower-than-planned promo coverage in the second half of November**, an unfavorable weather forecast — temperatures running below seasonal norms — and a softer Google-Trends signal for the brand vs. last year. The model isn't a black box; every prediction is decomposed into the features that drove it."*

Show the SHAP waterfall, hover sync with the bullets.

> *"And just to validate: our causal-impact analysis on the equivalent November promo from 2024 confirms multi-pack promos on this brand deliver around +9% lift over the four weeks they run."*

### Act 3 — The *what to do* (90s) · Simulator + Recommendations

Open `/simulator`, drag the sliders.

> *"So what can the commercial team actually do? Extend the existing multi-pack promo to cover weeks 47–48, at the current discount level. Simulate."*

Live re-forecast renders.

> *"This single action closes **about two-thirds of the gap**, at an estimated cost we extract from the trade plan. The new prediction interval still doesn't cross budget — we're honest about that."*

Switch to `/recommendations`.

> *"Our agent turns this into three scenarios for the commercial director:*
> - *Conservative: extend the existing multi-pack — partial gap closure, low risk*
> - *Balanced: add a secondary SKU bundle in the cold-weather regions — closes the full gap, medium cost*
> - *Aggressive: combine both with a digital media push — exceeds budget by ~3%, higher spend*"

> *"Each scenario has expected gap closure, confidence, and the data evidence behind it. The recommendation engine runs on Kimi K2-Instruct — that's why the language is specific: it knows what 'off-invoice' and 'incremental display' mean."*

Click "Explain this view".

> *"And for any view in the dashboard, the LLM produces a 3-bullet exec summary the commercial director can paste into an email."*

### Act 4 — The chat (30s) · Chat page

Type: *"What if January is colder than expected — does that hurt the Christmas window too?"*

> *"The agent uses tools to re-run the forecast, query the data, and explain. Watch the breadcrumbs: 'compare_vs_budget' → 'simulate_promo' → answer. It's not a chatbot bolted on — it's the same engine that powers the dashboard, accessed conversationally. Llama 3.3 via Groq, sub-second per turn."*

### Close (20s)
> *"Built in 24 hours: Polars + LightGBM with a Chronos foundation model for the cold-start SKUs; SHAP and Google CausalImpact for explaining; a Llama-3.3 + Kimi-K2 routing for recommendations. Hierarchical reconciliation so SKU, brand, and channel numbers always add up. End-to-end, code public on GitHub, deterministic demo data. We didn't just predict — we explained and recommended. That's where the commercial value is."*

---

## 🎯 What each scene proves to the judges

| Scene | Criterion proved |
|---|---|
| Overview gap detection | Forecast vs budget ✅ · Working demo ✅ |
| Confidence band + 3-year actuals | Technical robustness ✅ · Data usage ✅ |
| SHAP drivers | Explainability ✅ · Technical robustness ✅ |
| Causal lift | Promotion analysis ✅ · Data usage ✅ |
| Simulator | Actionability ✅ · Technical robustness ✅ |
| 3-scenario LLM output | Actionability ✅ · Explainability ✅ |
| External sources footer | Data usage ✅ |
| GitHub repo + `make demo` | Repo + run instructions ✅ |

Every checklist item appears in the live demo without us pointing at it.

---

## 🎤 Q&A prep — likely judge questions

**Q: How accurate is the forecast?**
> "12-week-equivalent rolling-origin cross-validation on Oct/Nov/Dec 2025 gives ensemble MAPE of X% at brand × subchannel and Y% at SKU × subchannel. We display prediction intervals everywhere so the user always sees uncertainty, not just a point estimate. The MAPE table is on the Forecast page."

**Q: Why an LLM? Couldn't you just show the numbers?**
> "Two reasons. First, the LLM converts SHAP + simulator output into language a commercial director can act on without reading a chart. Second, the chat lets non-technical users ask 'what if' without leaving Excel mode. The numbers are the engine; the LLM is the interface. We use Llama-3.3 via Groq for sub-second chat and Kimi-K2-Instruct via Novita for the deeper 3-scenario recommendation — best of both for latency and depth."

**Q: What's the foundation model doing?**
> "Chronos-Bolt is Amazon's time-series foundation model, called zero-shot through Hugging Face Inference. It's never trained on Damm data, but it provides a strong independent baseline. We use it specifically on the **117 of 471 SKU × subchannel series that have ≤2 months of history** — where our LightGBM model has nothing to learn from. For GROCERY series, we also use Salesforce Moirai-1.1 which accepts the promo plan as a covariate. We ensemble all three; ensemble beats any one model in our backtest."

**Q: Why is hierarchical reconciliation important here?**
> "Damm reports at multiple levels — total UK, channel, sub-channel, brand, SKU. If those numbers don't add up, the dashboard is useless to a commercial team. We use MinTrace reconciliation from Nixtla's `hierarchicalforecast` so every aggregation is exact. The brand chart sums to the total; the SKU rows sum to the brand. That's table-stakes for a commercial tool."

**Q: How does the recommendation know the cost of a promo?**
> "Promo cost comes from the trade plan — each event has a cost annotation. ROI = causal lift × revenue per Hl − promo cost. Where cost isn't in the data we mark the recommendation as 'cost TBD' rather than hiding the uncertainty."

**Q: The data must have been messy. What did you handle?**
> "Three big things. First, 21% of rows had null Hl — those are budget rows mixed into the sales table, we tag and split. Second, 1,186 rows have negative Hl — returns and credit notes, we net them. Third, one customer (a B2B distributor) is 40% of UK volume — we carve it out and forecast it separately so its replenishment cycle doesn't dominate retail signal. Also, the promo file had five different sheet layouts per retailer, so five bespoke parsers. All documented in DATA.md."

**Q: What didn't you have time for?**
> "Marketing Mix Modeling for cross-channel budget allocation, and a RAG layer over UK retail trade press. Both are natural extensions; the architecture supports them. Also: Moirai with full multivariate covariates is single-shot per series — caching is wired but a smarter batching would cut inference time further."

**Q: Could this go to production?**
> "The forecast layer and dashboard, yes — Nixtla, LightGBM, FastAPI, React are all production-grade. The LLM layer needs a stricter eval suite and prompt regression tests before production. Storage would move from local Parquet to a warehouse, and the anonymization layer becomes user-facing access control."

**Q: Why monthly forecasting when the brief mentioned weekly?**
> "The source data is monthly — Damm tracks `AÑO CALENDARIO` at month resolution. The brief allowed either weekly or monthly. We forecast monthly with full statistical rigor, then disaggregate into ISO weeks using the promo calendar so the GROCERY weekly view stays useful. Forecasting weekly directly on monthly data would invent precision we don't have."

---

## 🛡️ Demo safety net

- **Pre-computed at H22**: all forecasts + scenarios + SHAP results are baked into `snapshots/*.parquet`. Backend reads from snapshots by default; live HF calls only happen on the chat page.
- **Hero SKU is hard-coded** as a deep-link constant. `Estrella Damm × Off-trade grocery` is `?brand=ESTRELLA+DAMM&sub_channel=GROCERY` in the URL — bookmarked. If filters drift during demo, one click resets.
- **Live backend always.** No static-JSON fallback in the FE. If venue Wi-Fi dies, the LLM calls fail and we lean on the **backup video** instead.
- **Backup video**: record a 2-minute happy-path screen capture the morning of the demo. Stored in `/demo/backup.mp4` locally (not committed).
- **`make demo`**: single command starts both servers with logs in one terminal. Don't restart live.
- **Two browser tabs ready**: `http://localhost:5173` on the projector; `http://localhost:8000/docs` on a second screen for the inevitable "can we see the API?" question.

---

## ✂️ If the slot shrinks to 3 minutes

Cut: chat (Act 4) and the Q&A buffer. Keep: gap → why → simulator → recommendation. That's the spine.

## ✂️ If it shrinks to 90 seconds

Show only: Overview KPI gap → click problem SKU → Simulator (drag slider) → "Closes 65% of gap" badge → flip to Recommendations card with `BorderBeam`. Everything else is bonus.
