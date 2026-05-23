/**
 * Human labels for LightGBM feature slugs.
 *
 * The model exports drivers as raw feature names (`roll_mean_6`, `lag_12`,
 * `weather_temp_anom`, …). Those are unreadable to a Commercial Manager.
 * We map known slugs to short English labels here. Unknown slugs fall back
 * to a Title-Cased version of the slug so we degrade gracefully.
 */

const LABELS: Record<string, string> = {
  // Lag / momentum features
  lag_1:           "Last month's sales",
  lag_2:           "Two months ago",
  lag_3:           "Three months ago",
  lag_6:           "Six months ago",
  lag_12:          "Same month last year",
  roll_mean_3:     "3-month sales momentum",
  roll_mean_6:     "6-month sales momentum",
  roll_mean_12:    "12-month sales trend",
  roll_std_3:      "3-month sales volatility",
  roll_std_6:      "6-month sales volatility",

  // Calendar
  month:           "Time of year",
  quarter:         "Quarter",
  year:            "Year",
  is_holiday:      "Holiday week",
  weekend_share:   "Weekend share",

  // External
  weather_temp_anom:  "Temperature vs seasonal",
  weather_precip:     "Rainfall",
  weather_sunshine:   "Sunshine hours",
  trends_brand:       "Search interest (brand)",
  trends_category:    "Search interest (category)",
  ons_retail_index:   "UK retail spending index",

  // Promo / pricing
  promo_active:       "Promo running",
  discount_pct:       "Discount depth",
  price_index:        "Price vs category",
  competitor_promo:   "Competitor promo nearby",

  // Hierarchy / channel
  channel_share:      "Channel share",
  brand_share:        "Brand share",
}

export function driverLabel(feature: string): string {
  if (LABELS[feature]) return LABELS[feature]
  // Fallback: turn `weather_temp_anom` → "Weather Temp Anom"
  return feature
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}
