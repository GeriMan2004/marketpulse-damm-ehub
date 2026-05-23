/**
 * Drivers page — Dub-pattern: filter bar + SHAP waterfall + narrative side panel.
 */

import { useSearchParams } from "react-router-dom"
import { StickyFilterBar } from "@/components/StickyFilterBar"
import { DriversWaterfall } from "@/components/charts/DriversWaterfall"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
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
    <div className="px-8 pt-6 pb-12 max-w-7xl mx-auto">
      <div className="mb-1">
        <h1 className="text-xl font-semibold">Drivers</h1>
        <div className="text-xs text-muted-foreground">
          Why the model predicts what it does · {skuLabel} · {channelLabel}
        </div>
      </div>
      <StickyFilterBar />

      {!sku && (
        <Card className="mt-5">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Pick a SKU above to see what's driving its forecast.
          </CardContent>
        </Card>
      )}

      {sku && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Top SHAP drivers</CardTitle>
              <div className="text-[11px] text-muted-foreground">
                Bar = contribution to forecast (Hl). Green = pushes up, red = pulls down.
              </div>
            </CardHeader>
            <CardContent>
              {isLoading || !drivers ? <Skeleton className="h-[280px] w-full" /> :
                <DriversWaterfall drivers={drivers} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">In plain English</CardTitle>
              <div className="text-[11px] text-muted-foreground">LLM-narrated context per driver.</div>
            </CardHeader>
            <CardContent>
              {isLoading || !drivers ? (
                <div className="space-y-3">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : (
                <ol className="space-y-3 text-sm">
                  {drivers.map((d, i) => (
                    <li key={i} className="flex gap-3">
                      <Badge
                        variant={d.direction === "positive" ? "default" : "destructive"}
                        className="text-[10px] h-5"
                      >
                        #{i + 1}
                      </Badge>
                      <div>
                        <div className="font-medium">{d.feature}</div>
                        <div className="text-[11px] text-muted-foreground mt-1">{d.explanation}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
