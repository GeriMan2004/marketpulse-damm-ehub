/**
 * Step 1 — Diagnosis. Server Component.
 *
 * Now packs real data into `visible_state` for the LLM narrative call
 * (previously sent `{}`, which made the model correctly say "no data").
 * Drivers list shows the humanised feature label + the LLM-narrated
 * explanation (not the raw slug).
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ForecastChart } from "@/components/charts/ForecastChart"
import { DriversWaterfall } from "@/components/charts/DriversWaterfall"
import { serverFetch } from "@/lib/api"
import { driverLabel } from "@/lib/driver-labels"
import type { components } from "@/lib/api.gen"

type ForecastSeries = components["schemas"]["ForecastSeries"]
type Driver = components["schemas"]["Driver"]
type ExplainView = components["schemas"]["ExplainViewSummary"]

export async function DiagnosisPanel({
  sku, sub_channel,
}: {
  sku: string
  sub_channel: string
}) {
  const q = `?sku=${encodeURIComponent(sku)}&sub_channel=${encodeURIComponent(sub_channel)}`

  // Forecast + drivers are quick; fetch them first so we can pack their
  // numbers into the explain-view call.
  const [forecast, drivers] = await Promise.all([
    serverFetch<ForecastSeries>(`/api/forecast${q}`),
    serverFetch<Driver[]>(`/api/drivers${q}`),
  ])

  const totalForecastHl = (forecast.points ?? []).reduce((s, p) => s + p.point, 0)
  const topDrivers = drivers.slice(0, 5).map((d) => ({
    feature: driverLabel(d.feature),
    raw_feature: d.feature,
    direction: d.direction,
    shap_value: Math.round(d.shap_value),
  }))

  const narrative = await serverFetch<ExplainView>("/api/explain-view", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      page: "drivers",
      filters: { sku, sub_channel },
      visible_state: {
        sku,
        sub_channel,
        horizon_months: forecast.points?.length ?? 0,
        forecast_total_hl: Math.round(totalForecastHl),
        forecast_points: (forecast.points ?? []).slice(0, 6).map((p) => ({
          period: p.period,
          point_hl: Math.round(p.point),
          lo80_hl: Math.round(p.lo80),
          hi80_hl: Math.round(p.hi80),
        })),
        top_drivers: topDrivers,
      },
    }),
  }).catch(() => null)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Forecast vs target</CardTitle>
          <CardDescription>Median forecast with 80% confidence band; dashed = target.</CardDescription>
        </CardHeader>
        <CardContent>
          <ForecastChart points={forecast.points ?? []} />
        </CardContent>

        {narrative && (
          <div className="border-t border-border px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">
              In plain English
            </div>
            <div className="text-[13.5px] font-medium leading-snug text-neutral-900">
              {narrative.headline}
            </div>
            {narrative.bullets?.length > 0 && (
              <ul className="mt-2 space-y-1 text-[12.5px] text-neutral-600">
                {narrative.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-neutral-300 mt-1">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
            {narrative.suggested_next_action && (
              <div className="text-[12px] mt-3 pt-3 border-t border-border">
                <span className="font-medium text-neutral-900">Next: </span>
                <span className="text-neutral-600">{narrative.suggested_next_action}</span>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What&apos;s driving it</CardTitle>
          <CardDescription>SHAP contribution to forecast (Hl). Green ↑, red ↓.</CardDescription>
        </CardHeader>
        <CardContent>
          <DriversWaterfall drivers={drivers.slice(0, 6)} />
        </CardContent>
        {drivers.length > 0 && (
          <div className="border-t border-border px-4 py-3 space-y-3">
            {drivers.slice(0, 3).map((d, i) => (
              <div key={i} className="flex items-start gap-2">
                <Badge
                  variant={d.direction === "positive" ? "good" : "bad"}
                  className="mt-0.5 shrink-0"
                >
                  #{i + 1}
                </Badge>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium text-neutral-900">
                    {driverLabel(d.feature)}
                  </div>
                  <div className="text-[11.5px] text-neutral-500 leading-snug mt-0.5">
                    {d.explanation}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
