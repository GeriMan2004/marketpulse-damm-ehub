/**
 * Drivers page — SHAP waterfall + English narrative.
 *
 * UX rationale:
 *   - The chart shows magnitude; the narrative on the right says what it
 *     means in business language. Side-by-side, not stacked, so users can
 *     visually compare bar height against text without scrolling.
 *   - We render the bars in SHAP magnitude order (biggest impact at top)
 *     because that matches the question users actually ask: "what's the
 *     biggest reason this is happening?"
 */

import { useSearchParams } from "react-router-dom"
import Plot from "@/lib/plot"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { FilterBar } from "@/components/FilterBar"
import { useDrivers, useMeta } from "@/lib/hooks"

export default function Drivers() {
  const [params] = useSearchParams()
  const sku = params.get("sku")
  const sub_channel = params.get("sub_channel") ?? "GROCERY"
  const { data: meta } = useMeta()
  const { data: drivers, isLoading } = useDrivers(sku, sub_channel)

  const skuLabel = meta?.skus.find(s => s.id === sku)?.label ?? sku ?? "—"
  const channelLabel = meta?.sub_channels_labeled.find(c => c.code === sub_channel)?.label ?? sub_channel

  return (
    <div className="px-8 py-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Drivers</h1>
        <div className="text-sm text-muted-foreground">Why the model predicts what it does · {skuLabel} · {channelLabel}</div>
      </div>
      <FilterBar />

      {!sku && (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          Pick a SKU above to see what's driving its forecast.
        </CardContent></Card>
      )}

      {sku && isLoading && <Skeleton className="w-full h-[420px]" />}

      {sku && drivers && drivers.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Top SHAP drivers</CardTitle>
              <div className="text-xs text-muted-foreground">Bar = contribution to forecast (Hl). Positive = pushes forecast up.</div>
            </CardHeader>
            <CardContent>
              <Plot
                data={[{
                  type: "bar" as const,
                  orientation: "h" as const,
                  x: drivers.map(d => d.shap_value),
                  y: drivers.map(d => d.feature),
                  marker: {
                    color: drivers.map(d => d.shap_value > 0 ? "#16a34a" : "#dc2626"),
                  },
                  hovertemplate: "<b>%{y}</b><br>%{x:+.1f} Hl<extra></extra>",
                }]}
                layout={{
                  font: { color: "#e4e4e7", family: "ui-sans-serif, system-ui, sans-serif", size: 11 },
                  paper_bgcolor: "rgba(0,0,0,0)",
                  plot_bgcolor: "rgba(0,0,0,0)",
                  height: Math.max(280, drivers.length * 50),
                  margin: { l: 160, r: 30, t: 10, b: 40 },
                  xaxis: {
                    gridcolor: "#27272a", zerolinecolor: "#525252",
                    title: { text: "Hl contribution", font: { size: 10 } },
                    tickformat: "+,.0f",
                  },
                  yaxis: {
                    gridcolor: "#27272a", autorange: "reversed" as const,
                    tickfont: { size: 11 },
                  },
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: "100%" }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">In plain English</CardTitle>
              <div className="text-xs text-muted-foreground">LLM-narrated context for each driver.</div>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                {drivers.map((d, i) => (
                  <li key={i} className="flex gap-3">
                    <Badge variant={d.direction === "positive" ? "default" : "destructive"}>#{i+1}</Badge>
                    <div>
                      <div className="font-medium">{d.feature}</div>
                      <div className="text-xs text-muted-foreground mt-1">{d.explanation}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
