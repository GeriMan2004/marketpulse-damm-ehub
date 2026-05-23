/**
 * Promos page — ROI ranking + honest confidence labels.
 *
 * UX rationale:
 *   - Show ALL promo types including negative-lift ones. Hiding losers
 *     would be misleading; surfacing them builds trust.
 *   - Color-code the lift % on a diverging scale so positive lift POPS
 *     and negative lift is visually quiet (red).
 *   - Confidence pill on every row so users know which to trust.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { usePromoROI } from "@/lib/hooks"
import { formatHl, formatPercent, formatGBP, gapColor } from "@/lib/format"

export default function Promos() {
  const { data: roi, isLoading } = usePromoROI()

  return (
    <div className="px-8 py-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Promotion impact</h1>
        <div className="text-sm text-muted-foreground">
          Historical lift estimated by diff-in-diff against prior-12-month same-month baseline (GROCERY only).
        </div>
      </div>

      {isLoading && <Skeleton className="w-full h-[400px]" />}

      {roi && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{roi.length} promo types analyzed</CardTitle>
            <div className="text-xs text-muted-foreground">
              ROI = (lift × revenue per Hl) ÷ estimated cost. Confidence based on observation count and statistical significance.
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="text-left py-2.5 px-4">Promo type</th>
                  <th className="text-right py-2.5 px-4">Avg lift %</th>
                  <th className="text-right py-2.5 px-4">Avg lift Hl</th>
                  <th className="text-right py-2.5 px-4">Est. cost</th>
                  <th className="text-right py-2.5 px-4">ROI</th>
                  <th className="text-right py-2.5 px-4">n</th>
                  <th className="text-center py-2.5 px-4">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {roi.map((r, i) => (
                  <tr key={i} className="border-b border-border/40 hover:bg-accent/20">
                    <td className="py-2.5 px-4 font-medium">{r.promo_type}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-semibold" style={{ color: gapColor(r.avg_lift_pct) }}>
                      {formatPercent(r.avg_lift_pct)}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">
                      {r.avg_lift_hl > 0 ? "+" : ""}{formatHl(r.avg_lift_hl)}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">
                      {r.estimated_cost ? formatGBP(r.estimated_cost) : "—"}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      {r.roi !== null ? r.roi.toFixed(2) : "—"}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">{r.n_observations}</td>
                    <td className="py-2.5 px-4 text-center">
                      <Badge variant={
                        r.confidence === "high" ? "default" :
                        r.confidence === "medium" ? "secondary" : "outline"
                      }>{r.confidence}</Badge>
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
