/**
 * Number / label / period formatters — single source of truth for how
 * data appears on screen. Backend already does data translation
 * (SKU labels, channel labels). The frontend handles number formatting.
 *
 * Rules:
 *  - Hl: integer for >= 10, 1 decimal for <10, "<1" for sub-unit
 *  - Percent: signed, 1 decimal place, always shows + or −
 *  - Currency: GBP with K / M abbreviations for big numbers
 *  - Period: "Nov.26" → "November 2026", "2026-11-01" → "November 2026"
 */

const ENG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SPA_TO_NUM: Record<string, number> = {
  Ene: 1, Feb: 2, Mar: 3, Abr: 4, May: 5, Jun: 6,
  Jul: 7, Ago: 8, Sep: 9, Oct: 10, Nov: 11, Dic: 12,
};

export function formatHl(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M Hl`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value).toLocaleString()} Hl`;
  if (Math.abs(value) >= 10) return `${Math.round(value).toLocaleString()} Hl`;
  if (Math.abs(value) >= 1) return `${value.toFixed(1)} Hl`;
  return `<1 Hl`;
}

export function formatHlPlain(value: number | null | undefined): string {
  // Variant without the "Hl" suffix, for axis labels and tooltips
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1000)}k`;
  if (Math.abs(value) >= 10) return Math.round(value).toLocaleString();
  if (Math.abs(value) >= 1) return value.toFixed(1);
  return "<1";
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value * 100).toFixed(decimals)}%`;
}

export function formatGBP(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 1_000_000) return `£${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 10_000) return `£${(value / 1000).toFixed(0)}k`;
  return `£${Math.round(value).toLocaleString()}`;
}

export function formatPeriod(period: string | null | undefined): string {
  if (!period) return "—";
  const p = period.trim();
  // "Nov.26"
  if (p.includes(".") && p.split(".").length === 2) {
    const [m, y] = p.split(".");
    const num = SPA_TO_NUM[m.slice(0, 3)];
    if (num && /^\d+$/.test(y)) {
      const year = parseInt(y, 10) < 100 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
      return `${ENG_MONTHS[num - 1]} ${year}`;
    }
  }
  // ISO date
  if (p.includes("-")) {
    const parts = p.split("-");
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (year && month >= 1 && month <= 12) {
      return `${ENG_MONTHS[month - 1]} ${year}`;
    }
  }
  return p;
}

export function formatPeriodShort(period: string | null | undefined): string {
  if (!period) return "—";
  const p = period.trim();
  if (p.includes(".")) {
    const [m, y] = p.split(".");
    const num = SPA_TO_NUM[m.slice(0, 3)];
    if (num && /^\d+$/.test(y)) {
      return `${ENG_MONTHS[num - 1].slice(0, 3)} ${y}`;
    }
  }
  if (p.includes("-")) {
    const parts = p.split("-");
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[0], 10);
    if (year && month >= 1 && month <= 12) {
      return `${ENG_MONTHS[month - 1].slice(0, 3)} ${String(year).slice(2)}`;
    }
  }
  return p;
}

export function gapColor(gapPct: number | null | undefined): string {
  /**
   * Diverging red→amber→green based on gap %.
   * <-10% → red, ±5% → amber, >+10% → green.
   * Returns a Tailwind-friendly hex string (used in Plotly + inline styles).
   */
  if (gapPct === null || gapPct === undefined || Number.isNaN(gapPct)) return "#71717a"; // zinc-500
  const v = Math.max(-0.5, Math.min(0.5, gapPct)); // clip to [-50%, +50%]
  if (v <= -0.10) return "#dc2626"; // red-600
  if (v <= -0.05) return "#f97316"; // orange-500
  if (v <= -0.02) return "#eab308"; // yellow-500
  if (v < 0.02) return "#a3a3a3";   // neutral
  if (v < 0.05) return "#84cc16";   // lime-500
  return "#16a34a";                  // green-600
}

export function gapBadgeVariant(gapPct: number | null | undefined): "destructive" | "secondary" | "default" {
  if (gapPct === null || gapPct === undefined) return "secondary";
  if (gapPct < -0.02) return "destructive";
  if (gapPct > 0.02) return "default";
  return "secondary";
}

export function gapLabel(gapPct: number | null | undefined): string {
  if (gapPct === null || gapPct === undefined) return "—";
  if (gapPct < -0.10) return "Major shortfall";
  if (gapPct < -0.05) return "Below target";
  if (gapPct < -0.02) return "Slightly below";
  if (gapPct < 0.02) return "On target";
  if (gapPct < 0.05) return "Above target";
  return "Strongly above";
}
