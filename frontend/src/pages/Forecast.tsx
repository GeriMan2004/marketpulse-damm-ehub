/**
 * Forecast page — drill into one SKU × sub-channel.
 *
 * Shows: monthly forecast curve + 80% confidence band + per-month gap
 * table + anomaly markers. Click any month → drill to drivers.
 *
 * UX rationale:
 *   - This is the "is the prediction plausible?" surface. The curve has
 *     to BE legible at a glance: actuals (solid grey), forecast (solid red),
 *     interval (shaded band), target (dashed grey). Four-channel encoding.
 *   - Anomaly markers on the actuals series prevent the model's history
 *     from looking deceptively smooth — users see real noise.
 *   - The gap table below the chart serves users who prefer numbers to
 *     graphs (some directors do).
 */

import { useSearchParams } from "react-router-dom"
import { useMemo } from "react"
import Plot from "react-plotly.js"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { FilterBar } from "@/components/FilterBar"
import { useForecast, useMeta, useGap, useAnomalies } from "@/lib/hooks"
import {
  formatHl, formatPercent, formatPeriod,
  gapColor,
} from "@/lib/format"

export default function Forecast() {
  const [params] = useSearchParams()
  const sku = params.get("sku")
  const sub_channel = params.get("sub_channel") ?? "GROCERY"

  const { data: meta } = useMeta()
  const { data: forecast, isLoading: fcLoading } = useForecast(sku, sub_channel)
  const { data: gap } = useGap(sub_channel ?? null, 50)
  const { data: anomalies } = useAnomalies(sub_channel ?? null, 20)

  const skuLabel = meta?.skus.find(s => s.id === sku)?.label ?? sku ?? "—"
  const skuBrand = meta?.skus.find(s => s.id === sku)?.brand ?? ""
  const channelLabel = meta?.sub_channels_labeled.find(c => c.code === sub_channel)?.label ?? sub_channel

  const skuGaps = useMemo(() => {
    if (!gap) return []
    return gap.filter(g => g.sku === sku).sort((a, b) => a.period.localeCompare(b.period))
  }, [gap, sku])

  return (
    <div className="px-8 py-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{skuLabel}</h1>
          <div className="text-sm text-muted-foreground">{skuBrand} · {channelLabel}</div>
        </div>
      </div>
      <FilterBar />

      {!sku && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="text-lg font-medium">Pick a SKU</div>
            <div className="text-sm text-muted-foreground mt-2">
              Use the SKU dropdown above to drill into a specific product's forecast.
            </div>
          </CardContent>
        </Card>
      )}

      {sku && fcLoading && <Skeleton className="w-full h-[420px]" />}

      {sku && forecast && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Forecast vs target · next {forecast.points.length} months
            </CardTitle>
            <div className="text-xs text-muted-foreground">
              Shaded band = 80% prediction interval (post-conformal calibration).
            </div>
          </CardHeader>
          <CardContent>
            <ForecastChart
              points={forecast.points}
              gaps={skuGaps}
              anomalies={(anomalies ?? []).filter(a => a.sub_channel === sub_channel)}
            />
          </CardContent>
        </Card>
      )}

      {sku && skuGaps.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Per-month detail</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="text-left py-2 px-4">Month</th>
                  <th className="text-right py-2 px-4">Forecast</th>
                  <th className="text-right py-2 px-4">Target</th>
                  <th className="text-right py-2 px-4">Gap</th>
                  <th className="text-right py-2 px-4">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {skuGaps.map((g) => (
                  <tr key={g.period} className="border-b border-border/40 hover:bg-accent/20">
                    <td className="py-2 px-4">{formatPeriod(g.period)}</td>
                    <td className="py-2 px-4 text-right tabular-nums">{formatHl(g.forecast_hl)}</td>
                    <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">
                      {formatHl(g.budget_hl)}
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums" style={{ color: gapColor(g.gap_pct) }}>
                      {formatPercent(g.gap_pct)}
                    </td>
                    <td className="py-2 px-4 text-right">
                      <Badge variant={g.confidence === "high" ? "default" : "secondary"}>
                        {g.confidence}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ForecastChart({
  points, gaps, anomalies,
}: {
  points: { period: string; period_start: string; point: number; lo80: number; hi80: number }[]
  gaps: { period: string; budget_hl: number }[]
  anomalies: { period: string; actual_hl: number; z_score: number; candidate_cause: string }[]
}) {
  const xs = points.map(p => p.period_start)
  const ys = points.map(p => p.point)
  const lo = points.map(p => p.lo80)
  const hi = points.map(p => p.hi80)

  // Match the gap.target_hl to each forecast period so we can show the target line
  const targetByPeriod = new Map(gaps.map(g => [g.period, g.budget_hl]))
  const targetYs = points.map(p => targetByPeriod.get(p.period) ?? null)

  return (
    <Plot
      data={[
        // 80% interval — upper bound
        {
          x: xs, y: hi, name: "80% upper",
          type: "scatter" as const, mode: "lines" as const,
          line: { color: "rgba(231,76,76,0)", width: 0 },
          showlegend: false, hoverinfo: "skip" as const,
        },
        // 80% interval — fill down to lower bound
        {
          x: xs, y: lo, name: "80% PI",
          type: "scatter" as const, mode: "lines" as const,
          line: { color: "rgba(231,76,76,0)", width: 0 },
          fill: "tonexty" as const, fillcolor: "rgba(220, 38, 38, 0.18)",
          hovertemplate: "<b>80% interval</b><br>[%{y:.0f}]<extra></extra>",
        },
        // Forecast median
        {
          x: xs, y: ys, name: "Forecast",
          type: "scatter" as const, mode: "lines+markers" as const,
          line: { color: "#dc2626", width: 2.5 },
          marker: { size: 6, color: "#dc2626" },
          hovertemplate: "<b>%{x|%b %Y}</b><br>Forecast: %{y:,.0f} Hl<extra></extra>",
        },
        // Target dashed line
        {
          x: xs, y: targetYs, name: "Target",
          type: "scatter" as const, mode: "lines" as const,
          line: { color: "#a3a3a3", width: 1.5, dash: "dash" as const },
          hovertemplate: "<b>%{x|%b %Y}</b><br>Target: %{y:,.0f} Hl<extra></extra>",
        },
        // Anomalies as red dots
        anomalies.length > 0 ? {
          x: anomalies.map(a => parseAnomalyDate(a.period)),
          y: anomalies.map(a => a.actual_hl),
          name: "Anomaly",
          type: "scatter" as const, mode: "markers" as const,
          marker: { size: 12, color: "#dc2626", symbol: "circle-open", line: { color: "#dc2626", width: 2 } },
          text: anomalies.map(a => a.candidate_cause),
          hovertemplate: "<b>Anomaly %{x|%b %Y}</b><br>%{text}<br>z=%{customdata:.1f}<extra></extra>",
          customdata: anomalies.map(a => a.z_score),
        } : null,
      ].filter(Boolean) as any[]}
      layout={{
        font: { color: "#e4e4e7", family: "ui-sans-serif, system-ui, sans-serif", size: 11 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        height: 420,
        margin: { l: 60, r: 20, t: 20, b: 50 },
        xaxis: {
          gridcolor: "#27272a", zerolinecolor: "#27272a",
          tickformat: "%b %y", tickfont: { size: 10 },
        },
        yaxis: {
          gridcolor: "#27272a", zerolinecolor: "#27272a",
          tickformat: ",.0f", tickfont: { size: 10 },
          rangemode: "tozero" as const,
          title: { text: "Hl", font: { size: 11 } },
        },
        legend: {
          orientation: "h" as const, yanchor: "bottom" as const, y: -0.22, x: 0,
          font: { size: 10 },
        },
        hovermode: "x unified" as const,
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: "100%" }}
    />
  )
}

function parseAnomalyDate(period: string): string {
  // "Mar.24" → "2024-03-01"
  if (period.includes(".")) {
    const [m, y] = period.split(".")
    const SPA: Record<string, number> = {
      Ene:1,Feb:2,Mar:3,Abr:4,May:5,Jun:6,Jul:7,Ago:8,Sep:9,Oct:10,Nov:11,Dic:12,
    }
    const num = SPA[m.slice(0, 3)]
    if (num && /^\d+$/.test(y)) {
      const year = parseInt(y, 10) < 100 ? 2000 + parseInt(y, 10) : parseInt(y, 10)
      return `${year}-${String(num).padStart(2, "0")}-01`
    }
  }
  return period
}
