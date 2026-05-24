/**
 * Decision page — one SKU × sub-channel.
 *
 * Two views share the same route, switched by `?tab=`:
 *   - default (Overview): chart + supporting cards + 3 signal-grounded plays
 *   - ?tab=simulate     : reached via a "Pick a play" card
 *
 * No tab strip — the flow is linear (diagnose → simulate) and the back link
 * in each non-default view replaces a tab bar.
 */

import { Suspense } from "react"
import { PageContent } from "@/components/shell/PageContent"
import { PageWidthWrapper } from "@/components/shell/PageWidthWrapper"
import { Skeleton } from "@/components/ui/skeleton"
import { serverFetch } from "@/lib/api"
import { skuLabel } from "@/lib/meta"
import { formatGBP, gapColor } from "@/lib/format"
import type { components } from "@/lib/api.gen"
import { DiagnosisPanel } from "./diagnosis-panel"
import { SimulatePanel } from "./simulate-panel"

type Meta = components["schemas"]["MetaResponse"]
type GapItem = components["schemas"]["GapItem"]

export default async function DecisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string; channel: string }>
  searchParams: Promise<{ period?: string; tab?: string; granularity?: string }>
}) {
  const { sku: skuRaw, channel: channelRaw } = await params
  const { period, tab, granularity: granRaw } = await searchParams
  const granularity: "month" | "week" = granRaw === "week" ? "week" : "month"
  const sku = decodeURIComponent(skuRaw)
  const sub_channel = decodeURIComponent(channelRaw)

  const [meta, gaps] = await Promise.all([
    serverFetch<Meta>("/api/meta"),
    serverFetch<GapItem[]>("/api/gap"),
  ])

  const matchingGaps = gaps.filter((g) => g.sku === sku && g.sub_channel === sub_channel)
  const currentGap = period
    ? matchingGaps.find((g) => g.period === period) ?? matchingGaps[0]
    : matchingGaps[0]
  const targetPeriod = currentGap?.period ?? period

  const VALID_TABS = ["diagnosis", "simulate"] as const
  type TabSlot = (typeof VALID_TABS)[number]
  const activeTab: TabSlot = (VALID_TABS as readonly string[]).includes(tab ?? "")
    ? (tab as TabSlot)
    : "diagnosis"

  // The chart shows the channel + period anyway; the header keeps just
  // the SKU name + the headline gap chip. Channel is implicit in the URL
  // path and shown again on the chart card. Less is more.
  const monthsAtRisk = matchingGaps.length
  const worstGap = matchingGaps.length > 0
    ? matchingGaps.reduce((a, b) => (a.gap_pct < b.gap_pct ? a : b))
    : null
  const totalGapGbp = matchingGaps.reduce<number | null>((s, g) => {
    if (g.gap_gbp == null) return s
    return (s ?? 0) + g.gap_gbp
  }, null)

  const headerTitle = (
    <span className="flex items-baseline gap-2 min-w-0">
      <span className="truncate">{skuLabel(meta, sku)}</span>
      {monthsAtRisk > 0 && worstGap && totalGapGbp != null && (
        <span
          className="hidden md:inline text-[13px] font-medium tabular-nums shrink-0"
          style={{ color: gapColor(worstGap.gap_pct) }}
        >
          {formatGBP(totalGapGbp)}
          <span className="ml-1 font-normal text-neutral-400">
            · {monthsAtRisk}mo at risk
          </span>
        </span>
      )}
    </span>
  )

  return (
    <PageContent title={headerTitle} titleBackHref="/">
      <PageWidthWrapper className="pb-4">
        {activeTab === "diagnosis" ? (
          <Suspense fallback={<PanelSkeleton />}>
            <DiagnosisPanel
              sku={sku}
              sub_channel={sub_channel}
              currentGap={currentGap ?? null}
              targetPeriod={targetPeriod}
              granularity={granularity}
            />
          </Suspense>
        ) : (
          <SimulatePanel sku={sku} sub_channel={sub_channel} period={targetPeriod} />
        )}
      </PageWidthWrapper>
    </PageContent>
  )
}

function PanelSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Skeleton className="h-[320px] lg:col-span-2" />
      <Skeleton className="h-[320px]" />
    </div>
  )
}
