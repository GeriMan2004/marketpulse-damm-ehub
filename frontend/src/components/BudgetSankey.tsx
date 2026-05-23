/**
 * BudgetSankey — the hero visual on the Overview page.
 *
 * Why a Sankey here?
 *   - One frame shows the entire UK budget hierarchy AND its forecast health.
 *   - Flow width = forecast volume; node color = gap vs target.
 *   - Users see at a glance: "the big leak is in this sub-channel, in this brand".
 *   - Click any node → navigates to that drilldown.
 *
 * Compared to a treemap (also considered): a Sankey shows FLOW and
 * HIERARCHY explicitly, which matches how a commercial director thinks
 * about their book ("my budget flows to channels → brands → SKUs").
 * A treemap shows volume well but hides the hierarchy.
 */

import Plot from "@/lib/plot"
import { useNavigate } from "react-router-dom"
import { useSankey, useMeta } from "@/lib/hooks"
import { Skeleton } from "@/components/ui/skeleton"
import { gapColor } from "@/lib/format"

export function BudgetSankey() {
  const { data, isLoading, error } = useSankey()
  const { data: meta } = useMeta()
  const navigate = useNavigate()

  if (isLoading) return <Skeleton className="w-full h-[440px] rounded-lg" />
  if (error || !data) return <div className="text-destructive">Couldn't load budget flow.</div>

  // Build node hover text with rich info
  const labels = data.nodes.map(n => n.label)
  const customdata = data.nodes.map(n => [
    n.level,
    n.raw_code ?? "",
    n.forecast_hl,
    n.target_hl,
    n.gap_pct,
  ])
  const nodeColors = data.nodes.map(n => gapColor(n.gap_pct))

  const linkColors = data.links.map(l => {
    // Slightly transparent version of target node color
    const c = gapColor(l.gap_pct)
    return c + "55"  // alpha
  })

  const handleClick = (e: any) => {
    const pt = e?.points?.[0]
    if (!pt) return
    const node = data.nodes[pt.index]
    if (!node) return
    if (node.level === 2 && node.raw_code) {
      // sub_channel click → drill to gap filtered to that sub_channel
      navigate(`/forecast?sub_channel=${encodeURIComponent(node.raw_code)}`)
    } else if (node.level === 3 && node.raw_code) {
      // brand click → drill to forecast for that brand's hero SKU
      const heroSku = meta?.skus.find(s => s.brand === node.raw_code)?.id
      if (heroSku) {
        navigate(`/forecast?sku=${heroSku}`)
      }
    }
  }

  return (
    <Plot
      data={[{
        type: "sankey" as const,
        orientation: "h" as const,
        arrangement: "snap" as const,
        node: {
          label: labels,
          color: nodeColors,
          pad: 18,
          thickness: 18,
          line: { color: "rgba(255,255,255,0.1)", width: 0.5 },
          customdata: customdata as any,
          hovertemplate:
            "<b>%{label}</b><br>" +
            "Forecast: %{customdata[2]:,.0f} Hl<br>" +
            "Target:   %{customdata[3]:,.0f} Hl<br>" +
            "Gap:      %{customdata[4]:+.1%}<extra></extra>",
        } as any,
        link: {
          source: data.links.map(l => l.source),
          target: data.links.map(l => l.target),
          value: data.links.map(l => l.value),
          color: linkColors,
          label: data.links.map(l => l.label),
          hovertemplate: "<b>%{source.label} → %{target.label}</b><br>%{value:,.0f} Hl<extra></extra>",
        } as any,
      }]}
      layout={{
        font: { color: "#e4e4e7", family: "ui-sans-serif, system-ui, sans-serif", size: 12 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor:  "rgba(0,0,0,0)",
        height: 440,
        margin: { l: 10, r: 10, t: 10, b: 10 },
      }}
      config={{ displayModeBar: false, responsive: true }}
      onClick={handleClick}
      style={{ width: "100%", cursor: "pointer" }}
    />
  )
}
