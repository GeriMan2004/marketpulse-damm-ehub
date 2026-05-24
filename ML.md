# ML And Forecasting

The production target is monthly hectolitres (`Hl`) at:

```text
material_id x sub_channel x month
```

The UI labels this as SKU x channel. A forecast point is therefore:

```text
SKU + channel + future month -> predicted hL
```

## Training Command

```bash
make train
```

This runs `backend/app/services/forecast/train.py`, which orchestrates 11 steps:

| Step | Module | Output |
|---|---|---|
| 1 | `train_lgb` | LightGBM quantile models + learning curves |
| 2 | `autoarima` | `forecasts_autoarima.parquet` |
| 3 | `zeroshot` | `forecasts_zeroshot.parquet` |
| 4 | `cmbc` | `forecasts_cmbc.parquet` |
| 5 | `ensemble` | `forecast.parquet` |
| 6 | `reconcile` | aggregate forecast snapshots |
| 7 | `calibrate` | interval calibration |
| 8 | `cv` | rolling-origin CV metrics |
| 9 | `explain` | `drivers.parquet` + SHAP explainer |
| 10 | `anomaly` | `anomalies.parquet` |
| 11 | `causal` | `promo_roi.parquet` |

## Models Used

### 1. LightGBM Quantile Model

Main supervised model trained on Damm historical data.

Uses:

- lags: 1, 3, 6, 12 months
- rolling means
- month/quarter seasonality
- Fourier-style seasonal features
- external features
- target-encoded categoricals
- static SKU/channel metadata

Outputs:

- `lgb_p10`
- `lgb_p50`
- `lgb_p90`

`p50` is the central forecast. `p10` and `p90` form the 80% uncertainty band before calibration.

### 2. AutoARIMA / AutoETS

Classical baseline at brand x sub-channel grain.

Purpose:

- sanity check against the ML model
- help stable, long-history aggregate series

Output:

- `forecasts_autoarima.parquet`

### 3. Chronos-Bolt Zero-Shot

Uses `amazon/chronos-bolt-base` through the local `chronos-forecasting` package.

It is zero-shot because it is not trained on Damm data. It receives a historical sequence and predicts the future using patterns learned before this project.

Purpose:

- independent foundation-model baseline
- helps short or noisy SKU series

Output:

- `chronos_p10`
- `chronos_p50`
- `chronos_p90`

### 4. Chronos Promo Proxy

For `GROCERY`, the code builds a promo-aware variant of Chronos by applying a deterministic lift factor from monthly promo coverage.

It is not Moirai. It is a simple covariate-aware proxy used as one ensemble member.

Output:

- `chronos_promo_p10`
- `chronos_promo_p50`
- `chronos_promo_p90`

### 5. CMBC Carve-Out

`FREE TRADE CMBC` behaves like B2B replenishment rather than consumer retail demand.

The project models it separately using a StatsForecast combination:

- AutoARIMA
- SeasonalNaive

Output:

- `forecasts_cmbc.parquet`

## Ensemble

The canonical forecast is `forecast.parquet`.

It blends available components using channel-specific weights. Important example:

- `GROCERY` combines LightGBM, Chronos, and Chronos promo proxy.
- `FREE TRADE CMBC` gives priority to the CMBC carve-out.
- Some channels use stronger classical baselines if CV shows they work better.

The resulting columns include:

- `Hl_hat_p10`
- `Hl_hat_p50`
- `Hl_hat_p90`
- component columns such as `lgb_p50`, `chronos_p50`, `chronos_promo_p50`, `Hl_hat_autoarima`, `Hl_hat_cmbc`

## Calibration

`calibrate.py` adjusts prediction intervals by channel.

Purpose:

- make the 80% band more realistic
- avoid overconfident model bands

Output:

- `calibration.parquet`
- calibrated interval columns in `forecast.parquet` when available

## Rolling Cross-Validation

Rolling CV means testing the model as if time were moving forward.

Instead of randomly splitting rows, we repeatedly:

1. Train on months before a cutoff.
2. Predict the next 3 months.
3. Compare prediction vs actuals.
4. Move the cutoff forward.

This prevents future leakage and is appropriate for time series.

Output:

- `mape.parquet`
- `model_metrics.parquet`
- `model_cv_predictions.parquet`

Main metric:

- WAPE: `sum(abs(actual - forecast)) / sum(actual)`

Lower WAPE is better.

## Forecast vs Target

Forecast:

- model prediction from `forecast.parquet`

Target:

- generated `target_hl` from `targets.parquet`
- based on prior-year same-month actuals or trailing median fallback

Gap:

```text
gap_hl = forecast_hl - target_hl
gap_pct = gap_hl / target_hl
```

Negative gap means forecast is below target.

## Weekly Forecast

There is no separately trained weekly model.

`/api/forecast?granularity=week` uses `weekly_split.py` to distribute each monthly forecast across ISO weeks by days-in-month overlap.

This gives a useful weekly view while preserving the monthly total.

## Promotions

Promotions affect the system in three ways:

1. `promos.parquet` stores the weekly grocery promo calendar.
2. `chronos_promo` gives `GROCERY` a promo-aware ensemble member.
3. `promo_roi.parquet` estimates historical promo lift and ROI.

Promo ROI logic is deliberately simple:

```text
actual hL during promo month
vs
baseline hL from prior 12-month brand history
```

It runs only for `GROCERY`.

## Explainability

`explain.py` uses SHAP on the LightGBM p50 model.

The endpoint `/api/drivers` returns the top features pushing a forecast up or down. The frontend relabels them into business language like:

- last month's sales
- 3-month sales momentum
- seasonality
- weather
- search interest
- retail market trend

## Known Limits

- No official budget file is currently used; target is derived.
- Weekly forecast is a deterministic split of monthly forecast.
- Promo-to-SKU matching is brand/label based because the promo file uses retailer SKU names, not Damm material IDs.
- External context for future months uses prior-year proxy values.
- `/api/recommend` may return deterministic fallback scenarios if the LLM fails.
