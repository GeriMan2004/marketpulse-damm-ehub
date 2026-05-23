/**
 * Forecast page — Dub-pattern detail view for one SKU × sub-channel.
 */

import { useSearchParams } from "react-router-dom"
import { useMemo } from "react"

import { StickyFilterBar } from "@/components/StickyFilterBar"
import { ForecastAreaChart } from "@/components/charts/ForecastAreaChart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useForecast, useMeta, useGap, useAnomalies } from "@/lib/hooks"
import {
  formatHl, formatPercent, formatPeriod, gapColor,
} from "@/lib/format"

export default function Forecast() {
  const [params] = useSearchParams()
  const sku = params.get("sku")
  const sub_channel = params.get("sub_channel") ?? "GROCERY"

  const { data: meta } = useMeta()
  const { data: forecast, isLoading } = useForecast(sku, sub_channel)
  const { data: gap } = useGap(sub_channel ?? null, 50)
  const { data: anomalies } = useAnomalies(sub_channel ?? null, 20)

  const skuLabel = meta?.skus.find(s => s.id === sku)?.label ?? sku ?? "—"
  const skuBrand = meta?.skus.find(s => s.id === sku)?.brand ?? ""
  const channelLabel = meta?.sub_channels_labeled.find(c => c.code === sub_channel)?.label ?? sub_channel

  const skuGaps = useMemo(() => {
    if (!gap) return []
    return gap.filter(g => g.sku === sku).sort((a, b) => a.period.localeCompare(b.period))
  }, [gap, sku])

  // Convert forecast.points + matched targets into ForecastAreaChart shape
  const chartPoints = useMemo(() => {
    if (!forecast) return []
    const tgtByPeriod = new Map(skuGaps.map(g => [g.period, g.budget_hl]))
    return forecast.points.map(p => ({
      period: p.period,
      point: p.point,
      lo80: p.lo80,
      hi80: p.hi80,
      target: tgtByPeriod.get(p.period) ?? null,
    }))
  }, [forecast, skuGaps])

  return (
    <div className="px-8 pt-6 pb-12 max-w-7xl mx-auto">
      <div className="mb-1">
        <h1 className="text-xl font-semibold">{skuLabel}</h1>
        <div className="text-xs text-muted-foreground">{skuBrand} · {channelLabel}</div>
      </div>
      <StickyFilterBar />

      {!sku && (
        <Card className="mt-5">
          <CardContent className="py-12 text-center">
            <div className="text-sm font-medium">Pick a SKU</div>
            <div className="text-xs text-muted-foreground mt-2">
              Use the SKU dropdown above to drill into a specific product's forecast.
            </div>
          </CardContent>
        </Card>
      )}

      {sku && (
        <div className="space-y-5 mt-5">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  Forecast vs target · next {forecast?.points.length ?? "?"} months
                </CardTitle>
                {anomalies && anomalies.length > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    {anomalies.length} historical anomalies in this channel
                  </Badge>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Shaded band = 80% prediction interval (post-conformal calibration).
              </div>
            </CardHeader>
            <CardContent>
              {isLoading || !forecast ? (
                <Skeleton className="h-[320px] w-full" />
              ) : (
                <ForecastAreaChart points={chartPoints} />
              )}
            </CardContent>
          </Card>

          {skuGaps.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Per-month detail</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                      <th className="text-left py-2.5 px-4">Month</th>
                      <th className="text-right py-2.5 px-4">Forecast</th>
                      <th className="text-right py-2.5 px-4">Target</th>
                      <th className="text-right py-2.5 px-4">Gap</th>
                      <th className="text-right py-2.5 px-4">Confidence</th>
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
                          <Badge variant={g.confidence === "high" ? "default" : "secondary"} className="text-[10px]">
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
      )}
    </div>
  )
}
