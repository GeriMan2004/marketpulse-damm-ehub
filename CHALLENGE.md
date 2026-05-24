# MarketPulse UK — Challenge Summary

## 🎯 Challenge in one sentence

> Build a tool that uses **UK sales history**, **monthly budget** and **promotion plan** to forecast sales evolution, detect deviations against target, and identify which commercial actions could help close the gap.

## 📦 Provided datasets

- Current year promotion plan
- UK sales data since 2023
- Sales by anonymized customer
- Sales by brand
- Sales by SKU
- Sales by channel / sub-channel
- Monthly budget or target estimate
- Available promotional calendar

⚠️ **Confidentiality:** data may only be used within the hackathon. Specific supermarket/customer names must not appear in the demo unless fully anonymized.

## 🌍 External data (encouraged, must be documented)

- Market trends, off-trade channel trends
- Seasonality, holidays
- Weather
- Consumption indicators, search trends, events
- Any signal that may improve the forecast

## ✅ What teams must build (deliverables)

1. **Weekly and/or monthly sales forecasting model**
2. **Dashboard** comparing forecast vs. budget with clear deviations
3. **Promotion impact analysis**
4. **Actionable recommendations** for the commercial team, International Management or UK office
5. **Code repository** with clear run instructions
6. **Real working demo** (mockups/slides are not enough)

## 📋 Final submission checklist

- [ ] Repository includes clear run instructions
- [ ] Demo shows weekly or monthly forecast
- [ ] Solution compares forecast against budget or target
- [ ] Solution includes promotions in the analysis
- [ ] Tool explains **why** deviations happen
- [ ] Demo recommends actions to move closer to the target
- [ ] External sources used are documented

## 🏆 Judging criteria — what they value

| Criterion | What it means |
|---|---|
| **Actionability** | Must support a real business decision, not just display data |
| **Technical robustness** | Real analysis, models, optimization logic, clear evidence |
| **Data usage** | Cleaning, integration, enrichment with external sources |
| **Explainability** | Recommendations must be understandable to a business user |
| **Working demo** | End-to-end flow running live with real or representative data |

> *"Build something real, executable and explainable. Prioritize a working end-to-end flow over a broad but superficial solution."*

## ⏰ Time horizon

Week and month. No rolling forecast is provided — work with the given sales, budget and promotion plan.

## 🤖 What's allowed

Generative AI, LLMs, AutoML, APIs, no-code/low-code tools, notebooks, Streamlit, Power BI — anything. Document how to run it and its dependencies.

## Current Implementation Mapping

| Brief requirement | Current implementation |
|---|---|
| UK sales history | `UK DATA.xlsx` parsed into `wide_monthly.parquet` |
| Monthly budget or target estimate | `targets.parquet`, derived from prior-year actuals / trailing median |
| Promotion plan | `Damm Trade Plan - promotions.xlsx` parsed into `promos.parquet` |
| Weekly and/or monthly forecast | Monthly trained forecast; weekly view derived from monthly forecast |
| Forecast vs budget/target dashboard | `/` and `/decision/[sku]/[channel]` |
| Deviations and causes | `/api/gap`, `/api/drivers`, SHAP explanations, external context |
| Promotion impact | `/promos`, `/api/promos/roi`, promo windows for `GROCERY` |
| Commercial recommendations | `/api/recommend`, scenario cards, simulator |
| External sources documented | [DATA.md](DATA.md), [STACK.md](STACK.md), [README.md](README.md) |

Important wording for demo: because no reliable official budget table is consumed, say **target estimate** when explaining the comparison.
