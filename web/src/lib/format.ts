/**
 * Number + period formatters and severity scale.
 *
 * The 5-tier gap scale replaces the previous flat 4-bucket version. A -7%
 * miss and a -98% catastrophe used to look identical (both "negative"). Now:
 *
 *   critical  (≤ -25%)  deep red
 *   bad       (-25..-10) red
 *   warn      (-10..-2) amber
 *   neutral   (±2%)     gray
 *   good      (≥ +2%)   green
 *
 * Pair with the Badge variants of the same name. Anything outside the
 * inbox's quality filter shouldn't reach the UI anyway — the backend's
 * min_quality default already strips collapsed-forecast rows.
 */

export const formatHl = (v: number | null | undefined): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  const abs = Math.abs(v)
  if (abs >= 1000) return `${(v / 1000).toFixed(1)}k Hl`
  return `${v.toFixed(0)} Hl`
}

export const formatPercent = (v: number | null | undefined, decimals = 1): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  const sign = v > 0 ? "+" : ""
  return `${sign}${(v * 100).toFixed(decimals)}%`
}

export const formatGBP = (v: number | null | undefined): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  if (Math.abs(v) >= 1_000_000) return `£${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1000) return `£${(v / 1000).toFixed(1)}k`
  return `£${v.toFixed(0)}`
}

export const formatPeriod = (period: string): string => {
  // "2026-11" → "Nov 2026"; "Nov.26" → "Nov 2026"
  if (!period) return period
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  if (period.includes("-")) {
    const [y, m] = period.split("-")
    const idx = parseInt(m, 10) - 1
    return idx >= 0 && idx < 12 ? `${months[idx]} ${y}` : period
  }
  if (period.includes(".")) {
    const [m, y] = period.split(".")
    const yy = y.length === 2 ? `20${y}` : y
    return `${m} ${yy}`
  }
  return period
}

export const formatPeriodShort = (period: string): string => {
  // "2026-11" → "Nov '26"; "Nov.26" → "Nov '26"
  if (!period) return period
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  if (period.includes("-")) {
    const [y, m] = period.split("-")
    const idx = parseInt(m, 10) - 1
    return idx >= 0 && idx < 12 ? `${months[idx]} '${y.slice(2)}` : period
  }
  if (period.includes(".")) {
    const [m, y] = period.split(".")
    return `${m} '${y.length === 2 ? y : y.slice(2)}`
  }
  return period
}

/** Severity tone for a gap percentage. Used by Badge variants + chart fills. */
export type GapTone = "critical" | "bad" | "warn" | "neutral" | "good"

export const gapTone = (gapPct: number): GapTone => {
  if (gapPct <= -0.25) return "critical"
  if (gapPct <= -0.10) return "bad"
  if (gapPct <= -0.02) return "warn"
  if (gapPct >= 0.02) return "good"
  return "neutral"
}

/** Inline color (var() reference) for charts that need a direct fill/stroke. */
export const gapColor = (gapPct: number): string => {
  const tone = gapTone(gapPct)
  switch (tone) {
    case "critical": return "var(--critical)"
    case "bad":      return "var(--negative)"
    case "warn":     return "var(--warn)"
    case "good":     return "var(--positive)"
    default:         return "var(--neutral)"
  }
}
