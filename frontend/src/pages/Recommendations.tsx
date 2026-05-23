/**
 * Recommendations — the 3-scenario LLM-generated decision card.
 *
 * UX rationale:
 *   - Three cards side-by-side because users need to compare risk levels.
 *   - The "balanced" card (middle) wears a BorderBeam accent because
 *     that's typically the recommended scenario; it draws the eye.
 *   - Each card has a clear ladder: headline → numbers → actions → risks.
 *   - "Adopt" button drops the scenario into the Simulator for further tweaking.
 */

import { useSearchParams, useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BorderBeam } from "@/components/ui/border-beam"
import { FilterBar } from "@/components/FilterBar"
import { useRecommend, useMeta } from "@/lib/hooks"
import { formatHl, formatPercent, formatGBP } from "@/lib/format"

export default function Recommendations() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const sku = params.get("sku")
  const sub_channel = params.get("sub_channel") ?? "GROCERY"
  const period = params.get("period") ?? "Nov.26"
  const { data: meta } = useMeta()
  const { data: rec, isLoading } = useRecommend(sku, sub_channel, period)

  const skuLabel = meta?.skus.find(s => s.id === sku)?.label ?? sku ?? "—"
  const channelLabel = meta?.sub_channels_labeled.find(c => c.code === sub_channel)?.label ?? sub_channel

  return (
    <div className="px-8 py-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Recommended actions</h1>
        <div className="text-sm text-muted-foreground">
          Three scenarios from the LLM, grounded in real forecast + driver + promo-ROI data.
        </div>
      </div>
      <FilterBar />

      {!sku && (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          Pick a SKU above. We'll generate three commercial scenarios to close its gap.
        </CardContent></Card>
      )}

      {sku && (
        <Card>
          <CardContent className="py-3">
            <div className="text-sm">
              <span className="font-medium">{skuLabel}</span>
              <span className="text-muted-foreground"> · {channelLabel} · </span>
              <span className="font-medium">{period}</span>
              {rec && (
                <span className="text-muted-foreground ml-2">
                  · current gap: <span className="font-semibold" style={{ color: rec.current_gap_pct < 0 ? "#dc2626" : "#16a34a" }}>
                    {formatPercent(rec.current_gap_pct)}
                  </span> ({formatHl(rec.current_gap_hl)})
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[0,1,2].map(i => <Skeleton key={i} className="h-[420px]" />)}
        </div>
      )}

      {rec && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {rec.scenarios.map(s => {
            const isBalanced = s.label === "balanced"
            return (
              <Card key={s.label} className="relative overflow-hidden flex flex-col">
                {isBalanced && <BorderBeam size={140} duration={6} />}
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm capitalize">{s.label}</CardTitle>
                    {isBalanced && <Badge variant="default">Recommended</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{s.headline}</div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Total gap closure</div>
                    <div className="text-3xl font-semibold tabular-nums mt-1" style={{
                      color: s.total_expected_gap_closed_pct > 0 ? "#16a34a" : "#a3a3a3",
                    }}>
                      {formatPercent(s.total_expected_gap_closed_pct)}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Actions</div>
                    {s.actions.map((a, i) => (
                      <div key={i} className="border border-border rounded p-3 text-sm space-y-1">
                        <div className="font-medium">{a.action}</div>
                        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                          <span>Lift: {formatHl(a.expected_lift_hl)}</span>
                          <span>Closes: {formatPercent(a.expected_gap_closed_pct)}</span>
                          {a.estimated_cost && <span>Cost: {formatGBP(a.estimated_cost)}</span>}
                          <Badge variant="outline" className="text-[10px] py-0">{a.confidence}</Badge>
                        </div>
                        {a.evidence?.length > 0 && (
                          <ul className="text-xs text-muted-foreground/80 list-disc list-inside space-y-0.5 pt-1">
                            {a.evidence.map((e, j) => <li key={j}>{e}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="text-xs text-muted-foreground border-t border-border pt-3">
                    <span className="font-medium">Risk: </span>{s.risk_notes}
                  </div>

                  <Button
                    variant={isBalanced ? "default" : "outline"}
                    size="sm"
                    onClick={() => navigate(`/simulator?sku=${sku}&sub_channel=${encodeURIComponent(sub_channel)}`)}
                  >
                    Tweak in simulator →
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
