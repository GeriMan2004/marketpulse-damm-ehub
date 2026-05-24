/**
 * Human labels + business-language hints for LightGBM feature slugs.
 *
 * The model exports drivers as raw feature names (`roll_mean_6`, `lag_12`,
 * `weather_temp_anom`, …). Those are unreadable to a Commercial Manager,
 * and even when translated to "6-month sales momentum" they're still
 * model jargon. Each entry carries a `hint` — the one-line business
 * meaning — surfaced as a tooltip in the Top Drivers panel so the user
 * understands what the signal *is* and *why it matters*.
 */

type LabelEntry = { label: string; hint: string }

const LABELS: Record<string, LabelEntry> = {
  // Lag / momentum features
  lag_1:           { label: "Recent sales momentum",   hint: "How the latest month sold. Strong recent sales tend to extend forward into the forecast." },
  lag_2:           { label: "Two months back",         hint: "Volume two months ago — captures near-term cadence." },
  lag_3:           { label: "Quarter-ago pace",        hint: "Volume three months ago." },
  lag_6:           { label: "Six months back",         hint: "Mid-term position." },
  lag_12:          { label: "Same month last year",    hint: "Year-on-year benchmark for this calendar month — the biggest seasonal signal." },
  roll_mean_3:     { label: "Last quarter's trend",    hint: "Trailing 3-month average — the recent direction of travel." },
  roll_mean_6:     { label: "Half-year trend",         hint: "Trailing 6-month average — broader trend." },
  roll_mean_12:    { label: "12-month trend",          hint: "Trailing 12-month average — full-year baseline." },
  roll_std_3:      { label: "Recent volatility",       hint: "How bumpy the last 3 months looked. High volatility = a wider, less confident forecast." },
  roll_std_6:      { label: "Mid-term volatility",     hint: "How bumpy the last 6 months looked." },

  // Calendar
  month:           { label: "Time of year",            hint: "Calendar month — accounts for seasonal demand pattern." },
  quarter:         { label: "Quarter",                 hint: "Which quarter of the year." },
  year:            { label: "Year",                    hint: "Year — picks up long-run drift in the category." },
  is_holiday:      { label: "Holiday in month",        hint: "Whether a UK bank holiday falls in this month." },
  weekend_share:   { label: "Weekend share",           hint: "Share of weekend days in this month." },

  // External
  weather_temp_anom: { label: "Temperature vs avg",    hint: "How much warmer or cooler than the climatological norm. Beer tends to lift in warmer weather." },
  weather_precip:    { label: "Rainfall",              hint: "Monthly rainfall total." },
  weather_sunshine:  { label: "Sunshine hours",        hint: "Monthly sunshine — proxy for outdoor / BBQ demand." },
  trends_brand:      { label: "Brand search interest", hint: "Google-Trends search interest for the brand — a leading indicator of pull." },
  trends_category:   { label: "Category search interest", hint: "Google-Trends search interest for the category." },
  trends_estrella:   { label: "Estrella search interest", hint: "Google-Trends search for 'Estrella'." },
  trends_lager:      { label: "Lager search interest", hint: "Google-Trends search for 'lager'." },
  trends_beer:       { label: "Beer search interest",  hint: "Google-Trends search for 'beer'." },
  ons_retail_index:  { label: "UK retail spending",    hint: "ONS retail sales index — macro consumer demand." },
  ons_food_drink_index: { label: "Food & drink retail", hint: "ONS food & drink retail sub-index." },

  // Promo / pricing
  promo_active:    { label: "Promo running",           hint: "Whether a planned promotion is active in this month." },
  discount_pct:    { label: "Discount depth",          hint: "Size of the discount being applied." },
  price_index:     { label: "Price vs category",       hint: "Price compared to the category average." },
  competitor_promo:{ label: "Competitor promo nearby", hint: "Whether a competitor is running a competing promo." },

  // Hierarchy / channel
  channel_share:   { label: "Channel share",           hint: "This SKU's share within its channel." },
  brand_share:     { label: "Brand share",             hint: "This SKU's share within its brand portfolio." },
}

export function driverLabel(feature: string): string {
  if (LABELS[feature]) return LABELS[feature].label
  // Fallback: turn `weather_temp_anom` → "Weather Temp Anom"
  return feature
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

/** Business-language one-liner for the feature — used as a tooltip. */
export function driverHint(feature: string): string | undefined {
  return LABELS[feature]?.hint
}
