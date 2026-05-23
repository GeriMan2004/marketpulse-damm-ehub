/**
 * Overview — the answer to "where's the gap, in one screen".
 *
 * Composition (top to bottom):
 *   1. 4 KPI tiles      — quick numeric summary (forecast, target, gap %, SKUs at risk)
 *   2. LLM "story card" — natural-language narration of what the user is looking at
 *   3. Budget Sankey    — the hero visual: where is the budget flowing, where is it leaking?
 *   4. Problem SKUs     — top 5 SKUs with the worst gap %, click to drill
 *
 * UX rationale:
 *   - The first thing a commercial director wants to know is "are we OK?".
 *     The KPI tiles answer that in 2 seconds.
 *   - If they're not OK, they want to know "where". The Sankey shows it
 *     graphically in 5 seconds. They click the worst-colored node.
 *   - If they want detail, the problem-SKU list is a backup with explicit
 *     numbers (some people prefer tables to graphs).
 *   - The LLM card on top of the Sankey reads the visible state and
 *     narrates it in plain English — so a director who's reading on mobile
 *     gets the headline without having to interpret a Sankey.
 */

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { NumberTicker } from "@/components/ui/number-ticker"
import { BorderBeam } from "@/components/ui/border-beam"
import { useKpis, useGap, useExplainView, useMeta } from "@/lib/hooks"
import {
  formatHl, formatHlPlain, formatPercent, formatPeriodShort,
  gapBadgeVariant, gapLabel,
} from "@/lib/format"
import { BudgetSankey } from "@/components/BudgetSankey"
import { Link } from "react-router-dom"

function KpiTile({
  label, value, suffix = "", decimals = 0, hint, hero = false,
}: {
  label: string; value: number; suffix?: string; decimals?: number; hint?: string; hero?: boolean
}) {
  return (
    <Card className={hero ? "relative overflow-hidden" : ""}>
      {hero && <BorderBeam size={120} duration={6} />}
      <CardHeader className="pb-2">
        <CardTitle className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tabular-nums">
          <NumberTicker value={value} decimalPlaces={decimals} />
          {suffix && <span className="text-base text-muted-foreground ml-1">{suffix}</span>}
        </div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  )
}

export default function Overview() {
  const { data: kpis, isLoading: kpisLoading } = useKpis()
  const { data: gap } = useGap(null, 5)
  const { data: meta } = useMeta()
  const explainMut = useExplainView()
  const [summary, setSummary] = useState<{ headline: string; bullets: string[]; suggested_next_action: string | null } | null>(null)

  useEffect(() => {
    if (!kpis) return
    explainMut.mutate({
      page: "overview",
      filters: { period_range: kpis.period_range },
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
  }, [kpis?.total_forecast_hl])

  if (kpisLoading || !kpis) {
    return (
      <div className="px-8 py-6 space-y-6">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    )
  }

  const gapPctSigned = kpis.gap_pct * 100
  const isBelow = kpis.gap_pct < 0
  const periodRangeLabel = `${formatPeriodShort(kpis.period_range[0])} → ${formatPeriodShort(kpis.period_range[1])}`

  return (
    <div className="px-8 py-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <span className="text-sm text-muted-foreground">{periodRangeLabel}</span>
      </div>

      {/* KPI ROW */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile
          label="Forecast"
          value={kpis.total_forecast_hl}
          suffix="Hl"
          hint={formatHlPlain(kpis.total_forecast_hl)}
        />
        <KpiTile
          label="Target"
          value={kpis.total_budget_hl}
          suffix="Hl"
          hint="prior-year baseline"
        />
        <Card className="relative overflow-hidden">
          <BorderBeam size={120} duration={6} />
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Gap vs target
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">
              <NumberTicker value={gapPctSigned} decimalPlaces={1} />
              <span className="text-base text-muted-foreground ml-1">%</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant={gapBadgeVariant(kpis.gap_pct)}>{gapLabel(kpis.gap_pct)}</Badge>
              <span className="text-xs text-muted-foreground">
                {isBelow ? "−" : "+"}{formatHl(Math.abs(kpis.gap_hl))} absolute
              </span>
            </div>
          </CardContent>
        </Card>
        <KpiTile
          label="SKUs at risk"
          value={kpis.off_track_skus}
          hint={`of ${kpis.on_track_skus + kpis.off_track_skus} forecasted`}
        />
      </div>

      {/* LLM STORY CARD */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            {summary?.headline ?? "Generating story of the quarter…"}
          </CardTitle>
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
                <li className="pt-2 text-foreground">
                  → <span className="font-medium">{summary.suggested_next_action}</span>
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* BUDGET SANKEY — hero visual */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Budget flow</CardTitle>
          <div className="text-xs text-muted-foreground">
            Forecast volume flows from total UK → channels → sub-channels → top brands.
            <span className="text-foreground"> Color = gap vs target. </span>
            Click any node to drill.
          </div>
        </CardHeader>
        <CardContent>
          <BudgetSankey />
        </CardContent>
      </Card>

      {/* PROBLEM SKUS */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Most-at-risk SKU-months</CardTitle>
          <div className="text-xs text-muted-foreground">Sorted by % below target. Click to drill into the story.</div>
        </CardHeader>
        <CardContent>
          {!gap?.length ? (
            <div className="text-sm text-muted-foreground">No gap data yet — run <code>make train</code>.</div>
          ) : (
            <div className="space-y-2">
              {gap.slice(0, 5).map((g, i) => {
                const sku = meta?.skus.find(s => s.id === g.sku)
                return (
                  <Link key={i}
                    to={`/forecast?sku=${g.sku}&sub_channel=${encodeURIComponent(g.sub_channel)}`}
                    className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent/40 transition group">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{sku?.label ?? g.sku}</span>
                      <span className="text-xs text-muted-foreground">
                        {g.sub_channel} · {formatPeriodShort(g.period)}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums" style={{ color: g.gap_pct < 0 ? "#dc2626" : "#16a34a" }}>
                        {formatPercent(g.gap_pct)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatHl(g.forecast_hl)} forecast · {formatHl(g.budget_hl)} target
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
