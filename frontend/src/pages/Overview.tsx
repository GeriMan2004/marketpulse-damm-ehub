/**
 * Overview — Dub-style analytics dashboard.
 *
 * Layout (top to bottom, exactly mirrors dub.co's analytics page):
 *   1. Sticky filter bar       (brand / sub_channel / SKU chips, URL-synced)
 *   2. KPI row                 (forecast / target / gap % / SKUs at risk)
 *   3. Main time-series chart  (aggregated forecast vs target with PI band)
 *   4. Two-column breakdowns   (problem SKUs | sub-channel mix)
 *   5. LLM "story of the period" card
 *
 * Every section is filterable by the sticky bar. Numbers and chart all
 * react to whatever subset is selected. No chart is the "hero" — they're
 * coordinated views of the same underlying slice.
 */

import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ArrowRight, AlertCircle } from "lucide-react"

import { StickyFilterBar } from "@/components/StickyFilterBar"
import { KpiRow } from "@/components/KpiRow"
import { ForecastAreaChart } from "@/components/charts/ForecastAreaChart"
import { GapByChannelChart } from "@/components/charts/GapByChannelChart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useKpis, useGap, useMeta, useExplainView,
  useForecastTimeline, useForecastByChannel,
} from "@/lib/hooks"
import {
  formatHl, formatPercent, formatPeriodShort, gapColor,
} from "@/lib/format"

type Summary = {
  headline: string
  bullets: string[]
  suggested_next_action: string | null
}

export default function Overview() {
  const [params] = useSearchParams()
  const brand = params.get("brand")
  const sub_channel = params.get("sub_channel")

  const { data: meta } = useMeta()
  const { data: kpis } = useKpis()
  const { data: timeline } = useForecastTimeline(brand, sub_channel)
  const { data: byChannel } = useForecastByChannel(brand)
  const { data: gap } = useGap(sub_channel, 8)

  const explainMut = useExplainView()
  const [summary, setSummary] = useState<Summary | null>(null)

  useEffect(() => {
    if (!kpis) return
    explainMut.mutate({
      page: "overview",
      filters: { brand, sub_channel, period_range: kpis.period_range },
      visible_state: {
        total_forecast_hl: kpis.total_forecast_hl,
        total_target_hl: kpis.total_budget_hl,
        gap_hl: kpis.gap_hl,
        gap_pct: kpis.gap_pct,
        on_track_skus: kpis.on_track_skus,
        off_track_skus: kpis.off_track_skus,
      },
    }, { onSuccess: setSummary })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpis?.total_forecast_hl, brand, sub_channel])

  const periodRangeLabel = kpis
    ? `${formatPeriodShort(kpis.period_range[0])} → ${formatPeriodShort(kpis.period_range[1])}`
    : ""

  return (
    <div className="px-8 pt-6 pb-12 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="text-xl font-semibold">Overview</h1>
        <span className="text-xs text-muted-foreground tabular-nums">{periodRangeLabel}</span>
      </div>
      <div className="text-xs text-muted-foreground mb-5">
        Aggregated forecast vs target across the UK book. Use the filters below to narrow down.
      </div>

      <StickyFilterBar />

      <div className="space-y-5 mt-5">
        <KpiRow kpis={kpis} />

        {/* MAIN TIME-SERIES CHART */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Forecast vs target · monthly</CardTitle>
              <div className="flex items-center gap-2 text-xs">
                <LegendDot color="#dc2626" /><span className="text-muted-foreground">Forecast</span>
                <LegendDot color="#dc262644" border /><span className="text-muted-foreground">80% PI</span>
                <LegendDot color="#a3a3a3" /><span className="text-muted-foreground">Target</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!timeline ? <Skeleton className="h-[320px] w-full" /> : <ForecastAreaChart points={timeline} />}
          </CardContent>
        </Card>

        {/* TWO-COLUMN BREAKDOWN */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* PROBLEM SKU TABLE */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Most-at-risk SKU-months</CardTitle>
                <span className="text-[11px] text-muted-foreground">Click a row to investigate →</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!gap ? (
                <div className="px-5 py-4 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
                </div>
              ) : gap.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  No SKU-months matched your filters.
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {gap.slice(0, 8).map((g) => {
                    const sku = meta?.skus.find(s => s.id === g.sku)
                    const channel = meta?.sub_channels_labeled.find(c => c.code === g.sub_channel)
                    return (
                      <Link
                        key={`${g.sku}-${g.period}`}
                        to={`/forecast?sku=${g.sku}&sub_channel=${encodeURIComponent(g.sub_channel)}`}
                        className="flex items-center gap-3 px-5 py-2.5 hover:bg-accent/30 transition group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{sku?.label ?? g.sku}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {channel?.label ?? g.sub_channel} · {formatPeriodShort(g.period)}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-medium tabular-nums" style={{ color: gapColor(g.gap_pct) }}>
                            {formatPercent(g.gap_pct)}
                          </div>
                          <div className="text-[11px] text-muted-foreground tabular-nums">
                            {formatHl(g.forecast_hl)} / {formatHl(g.budget_hl)}
                          </div>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition shrink-0" />
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* SUB-CHANNEL BREAKDOWN BAR */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">By sub-channel</CardTitle>
              <div className="text-[11px] text-muted-foreground">
                Bar = forecast Hl. Color = gap vs target.
              </div>
            </CardHeader>
            <CardContent>
              {!byChannel ? <Skeleton className="h-[240px] w-full" />
                : <GapByChannelChart rows={byChannel} />}
            </CardContent>
          </Card>
        </div>

        {/* LLM STORY */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                {summary?.headline ?? "Generating story of the period…"}
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">LLM summary</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {!summary ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-4/6" />
              </div>
            ) : (
              <ul className="space-y-2 text-sm text-muted-foreground">
                {summary.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2"><span className="text-primary">·</span>{b}</li>
                ))}
                {summary.suggested_next_action && (
                  <li className="pt-2 text-foreground border-t border-border/40 mt-2">
                    → <span className="font-medium">{summary.suggested_next_action}</span>
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function LegendDot({ color, border = false }: { color: string; border?: boolean }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full"
      style={{
        background: color,
        border: border ? `1px solid ${color.replace(/[0-9a-f]{2}$/i, "ff")}` : undefined,
      }}
    />
  )
}
