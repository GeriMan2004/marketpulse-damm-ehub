/**
 * KpiRow — Dub's "metric tiles in a horizontal row" pattern.
 *
 * One slim card per metric: tiny label up top, big tabular number,
 * small delta below. No animations on update beyond NumberTicker.
 */

import { NumberTicker } from "@/components/ui/number-ticker"
import { cn } from "@/lib/utils"
import { formatHl, gapColor, gapLabel } from "@/lib/format"
import type { Kpis } from "@/lib/hooks"
import { Skeleton } from "@/components/ui/skeleton"

export function KpiRow({ kpis }: { kpis: Kpis | undefined }) {
  if (!kpis) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    )
  }

  const gapPctSigned = kpis.gap_pct
  const isBelow = gapPctSigned < 0

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard
        label="Forecast"
        value={kpis.total_forecast_hl}
        suffix="Hl"
      />
      <KpiCard
        label="Target"
        value={kpis.total_budget_hl}
        suffix="Hl"
        muted
      />
      <KpiCard
        label="Gap vs target"
        value={gapPctSigned * 100}
        suffix="%"
        decimals={1}
        valueColor={gapColor(gapPctSigned)}
        sublabel={`${isBelow ? "−" : "+"}${formatHl(Math.abs(kpis.gap_hl))} · ${gapLabel(gapPctSigned)}`}
      />
      <KpiCard
        label="SKUs at risk"
        value={kpis.off_track_skus}
        sublabel={`of ${kpis.on_track_skus + kpis.off_track_skus} forecasted`}
      />
    </div>
  )
}

function KpiCard({
  label, value, suffix, decimals = 0, valueColor, sublabel, muted = false,
}: {
  label: string
  value: number
  suffix?: string
  decimals?: number
  valueColor?: string
  sublabel?: string
  muted?: boolean
}) {
  return (
    <div className={cn(
      "rounded-lg border border-border bg-card px-4 py-3",
      muted && "opacity-80",
    )}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums mt-1.5" style={{ color: valueColor }}>
        <NumberTicker value={value} decimalPlaces={decimals} />
        {suffix && <span className="text-sm text-muted-foreground ml-1">{suffix}</span>}
      </div>
      {sublabel && (
        <div className="text-[11px] text-muted-foreground mt-1.5 truncate">{sublabel}</div>
      )}
    </div>
  )
}
