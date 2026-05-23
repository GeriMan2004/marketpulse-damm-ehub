/**
 * Simulator — the killer feature.
 *
 * UX rationale:
 *   - This is the page that turns "the model says we'll miss target" into
 *     "and here's what to do about it." Every other page is read-only;
 *     this page is the user's lever.
 *   - The headline is "Closes XX% of gap" — gigantic NumberTicker that
 *     animates whenever the user drags a slider. The visceral feedback
 *     ("the number went UP when I dragged this!") is what makes the
 *     simulator memorable.
 *   - The chart shows baseline vs simulated overlaid so the user SEES
 *     the lift, doesn't have to imagine it.
 */

import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import Plot from "@/lib/plot"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { NumberTicker } from "@/components/ui/number-ticker"
import { ShimmerButton } from "@/components/ui/shimmer-button"
import { FilterBar } from "@/components/FilterBar"
import { Slider } from "@/components/ui/slider"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useSimulate, useForecast, useMeta } from "@/lib/hooks"
import { formatHl, formatGBP, formatPeriodShort } from "@/lib/format"

const PROMO_TYPES = ["multi-buy", "price-cut", "rollback", "clearance", "listing"]

export default function Simulator() {
  const [params] = useSearchParams()
  const sku = params.get("sku")
  const sub_channel = params.get("sub_channel") ?? "GROCERY"

  const { data: meta } = useMeta()
  const { data: forecast } = useForecast(sku, sub_channel)

  const [discount, setDiscount] = useState(10)
  const [promoType, setPromoType] = useState("multi-buy")
  const [selectedMonths, setSelectedMonths] = useState<string[]>([])
  const simulate = useSimulate()

  // Default-select the first future month once forecast loads
  useEffect(() => {
    if (forecast?.points.length && selectedMonths.length === 0) {
      setSelectedMonths([forecast.points[2]?.period ?? forecast.points[0].period])
    }
  }, [forecast, selectedMonths.length])

  const skuLabel = meta?.skus.find(s => s.id === sku)?.label ?? sku ?? "—"
  const channelLabel = meta?.sub_channels_labeled.find(c => c.code === sub_channel)?.label ?? sub_channel

  const handleRun = () => {
    if (!sku || !sub_channel || selectedMonths.length === 0) return
    simulate.mutate({
      sku, sub_channel, months: selectedMonths,
      discount_pct: discount, promo_type: promoType,
    })
  }

  const result = simulate.data
  const gapClosed = result ? result.gap_closed_pct * 100 : 0
  const liftedHl = result
    ? result.simulated.points.reduce((s, p) => s + p.point, 0)
      - result.baseline.points.reduce((s, p) => s + p.point, 0)
    : 0

  return (
    <div className="px-8 py-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">What-if simulator</h1>
        <div className="text-sm text-muted-foreground">{skuLabel} · {channelLabel}</div>
      </div>
      <FilterBar />

      {!sku && (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          Pick a SKU above. Then choose months, a promo type, and a discount to simulate.
        </CardContent></Card>
      )}

      {sku && !forecast && <Skeleton className="w-full h-[300px]" />}

      {sku && forecast && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* CONTROLS */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Controls</CardTitle>
              <div className="text-xs text-muted-foreground">Configure a promo, hit Simulate.</div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Promo months</label>
                <div className="grid grid-cols-3 gap-1.5 mt-2">
                  {forecast.points.map(p => {
                    const active = selectedMonths.includes(p.period)
                    return (
                      <button
                        key={p.period}
                        onClick={() => setSelectedMonths(prev =>
                          prev.includes(p.period)
                            ? prev.filter(m => m !== p.period)
                            : [...prev, p.period]
                        )}
                        className={`px-2 py-1.5 text-xs rounded border transition ${
                          active
                            ? "bg-primary/20 border-primary/60 text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/40"
                        }`}
                      >
                        {formatPeriodShort(p.period)}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Discount intensity: <span className="text-foreground font-medium">{discount}%</span>
                </label>
                <Slider
                  value={[discount]}
                  onValueChange={(v: number[]) => setDiscount(v[0])}
                  min={0} max={30} step={1}
                  className="mt-3"
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Promo type</label>
                <Select value={promoType} onValueChange={setPromoType}>
                  <SelectTrigger className="mt-2 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROMO_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <ShimmerButton
                onClick={handleRun}
                disabled={selectedMonths.length === 0 || simulate.isPending}
                className="w-full"
              >
                {simulate.isPending ? "Simulating…" : "Simulate"}
              </ShimmerButton>
            </CardContent>
          </Card>

          {/* OUTPUT */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Result</CardTitle>
            </CardHeader>
            <CardContent>
              {!result && (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  Configure a scenario and hit Simulate.
                </div>
              )}
              {result && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Gap closed</div>
                      <div className="text-3xl font-semibold tabular-nums mt-1" style={{
                        color: result.gap_closed_pct > 0 ? "#16a34a" : "#dc2626",
                      }}>
                        <NumberTicker value={gapClosed} decimalPlaces={1} /><span className="text-base ml-1 text-muted-foreground">%</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Lift added</div>
                      <div className="text-2xl font-semibold tabular-nums mt-1">
                        {liftedHl > 0 ? "+" : ""}{formatHl(liftedHl)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Est. cost</div>
                      <div className="text-2xl font-semibold tabular-nums mt-1">
                        {result.estimated_cost ? formatGBP(result.estimated_cost) : "—"}
                      </div>
                    </div>
                  </div>

                  <Plot
                    data={[
                      {
                        x: result.baseline.points.map(p => p.period_start),
                        y: result.baseline.points.map(p => p.point),
                        name: "Baseline",
                        type: "scatter" as const, mode: "lines+markers" as const,
                        line: { color: "#a3a3a3", width: 2, dash: "dot" as const },
                      },
                      {
                        x: result.simulated.points.map(p => p.period_start),
                        y: result.simulated.points.map(p => p.point),
                        name: "Simulated",
                        type: "scatter" as const, mode: "lines+markers" as const,
                        line: { color: "#dc2626", width: 2.5 },
                        fill: "tonexty" as const,
                        fillcolor: result.gap_closed_pct > 0 ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.12)",
                      },
                    ]}
                    layout={{
                      font: { color: "#e4e4e7", size: 11 },
                      paper_bgcolor: "rgba(0,0,0,0)",
                      plot_bgcolor: "rgba(0,0,0,0)",
                      height: 260,
                      margin: { l: 50, r: 20, t: 20, b: 40 },
                      xaxis: { gridcolor: "#27272a", tickformat: "%b %y" },
                      yaxis: { gridcolor: "#27272a", title: { text: "Hl", font: { size: 10 } } },
                      legend: { orientation: "h" as const, yanchor: "bottom" as const, y: -0.3, font: { size: 10 } },
                    }}
                    config={{ displayModeBar: false, responsive: true }}
                    style={{ width: "100%" }}
                  />

                  <div className="text-xs text-muted-foreground italic">
                    {result.notes}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
