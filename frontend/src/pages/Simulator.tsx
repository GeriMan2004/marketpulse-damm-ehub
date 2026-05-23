/**
 * Simulator — Dub-pattern detail page with controls panel + result panel.
 */

import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { StickyFilterBar } from "@/components/StickyFilterBar"
import { SimulatorChart } from "@/components/charts/SimulatorChart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { NumberTicker } from "@/components/ui/number-ticker"
import { ShimmerButton } from "@/components/ui/shimmer-button"
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

  const chartSeries = result
    ? result.baseline.points.map((b, i) => ({
        period: b.period,
        baseline: b.point,
        simulated: result.simulated.points[i]?.point ?? b.point,
      }))
    : []

  return (
    <div className="px-8 pt-6 pb-12 max-w-7xl mx-auto">
      <div className="mb-1">
        <h1 className="text-xl font-semibold">What-if simulator</h1>
        <div className="text-xs text-muted-foreground">{skuLabel} · {channelLabel}</div>
      </div>
      <StickyFilterBar />

      {!sku && (
        <Card className="mt-5">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Pick a SKU above. Then choose months, a promo type, and a discount to simulate.
          </CardContent>
        </Card>
      )}

      {sku && !forecast && <Skeleton className="w-full h-[300px] mt-5" />}

      {sku && forecast && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mt-5">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Controls</CardTitle>
              <div className="text-[11px] text-muted-foreground">Configure a promo, then hit Simulate.</div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Promo months</label>
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
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
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
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Promo type</label>
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
                    <Metric label="Gap closed" value={
                      <span style={{ color: result.gap_closed_pct > 0 ? "#16a34a" : "#dc2626" }}>
                        <NumberTicker value={gapClosed} decimalPlaces={1} />%
                      </span>
                    } />
                    <Metric label="Lift added" value={
                      <>{liftedHl > 0 ? "+" : ""}{formatHl(liftedHl)}</>
                    } />
                    <Metric label="Est. cost" value={
                      result.estimated_cost ? formatGBP(result.estimated_cost) : "—"
                    } />
                  </div>

                  <SimulatorChart series={chartSeries} />

                  <div className="text-[11px] text-muted-foreground italic border-t border-border/40 pt-3">
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

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
    </div>
  )
}
