/**
 * Decision page — unified deep-dive for one SKU × sub-channel.
 *
 * Wrapped in <PageContent title={skuLabel} titleBackHref="/" controls={gapBadge}>
 * which gives us Dub-consumer's sticky title bar with back arrow + right-side
 * gap badge. Tabs render below in the content area.
 */

import { Suspense } from "react"
import { PageContent } from "@/components/shell/PageContent"
import { PageWidthWrapper } from "@/components/shell/PageWidthWrapper"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { serverFetch } from "@/lib/api"
import { skuLabel, channelLabel } from "@/lib/meta"
import { formatHl, formatPercent, gapColor, formatPeriod } from "@/lib/format"
import type { components } from "@/lib/api.gen"
import { DecisionTabs } from "./decision-tabs"
import { DiagnosisPanel } from "./diagnosis-panel"
import { OptionsPanel } from "./options-panel"
import { SimulatePanel } from "./simulate-panel"
import { RecentDecisionTracker } from "@/components/RecentDecisionTracker"

type Meta = components["schemas"]["MetaResponse"]
type GapItem = components["schemas"]["GapItem"]

export default async function DecisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string; channel: string }>
  searchParams: Promise<{ period?: string; tab?: string }>
}) {
  const { sku: skuRaw, channel: channelRaw } = await params
  const { period, tab } = await searchParams
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

  const VALID_TABS = ["diagnosis", "options", "simulate"] as const
  type TabSlot = (typeof VALID_TABS)[number]
  const activeTab: TabSlot = (VALID_TABS as readonly string[]).includes(tab ?? "")
    ? (tab as TabSlot)
    : "diagnosis"

  const gapBadge = currentGap ? (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium leading-tight">Gap</div>
        <div
          className="text-sm font-semibold tabular-nums tracking-tight"
          style={{ color: gapColor(currentGap.gap_pct) }}
        >
          {formatPercent(currentGap.gap_pct, 1)} · {formatHl(currentGap.gap_hl)}
        </div>
      </div>
      <Badge variant="outline" className="capitalize">{currentGap.confidence}</Badge>
    </div>
  ) : null

  return (
    <PageContent title={skuLabel(meta, sku)} titleBackHref="/" controls={gapBadge}>
      {/* Side-effect-only: writes to localStorage so the sidebar's
          "Recent" section can show this visit. Renders nothing. */}
      <RecentDecisionTracker
        sku={sku}
        sub_channel={sub_channel}
        period={targetPeriod}
        sku_label={skuLabel(meta, sku)}
        channel_label={channelLabel(meta, sub_channel)}
      />
      <PageWidthWrapper className="pb-10">
        <p className="text-sm text-neutral-500 mb-6">
          {channelLabel(meta, sub_channel)} · {targetPeriod ? formatPeriod(targetPeriod) : "—"}
          {currentGap && (
            <>
              {" · forecast "}
              <span className="tabular-nums">{formatHl(currentGap.forecast_hl)}</span>
              {" vs target "}
              <span className="tabular-nums">{formatHl(currentGap.budget_hl)}</span>
            </>
          )}
        </p>

        {/* Only the active tab renders. Switching tabs updates ?tab= which
            re-renders just that panel via RSC + Suspense. Avoids the
            Recharts width=-1 warning (hidden tabs collapse to 0 width)
            and avoids wasted LLM calls on tabs the user never visits. */}
        <DecisionTabs active={activeTab} />
        <div className="mt-4">
          {activeTab === "options" ? (
            <Suspense fallback={<PanelSkeleton />}>
              <OptionsPanel sku={sku} sub_channel={sub_channel} period={targetPeriod} />
            </Suspense>
          ) : activeTab === "simulate" ? (
            <SimulatePanel sku={sku} sub_channel={sub_channel} />
          ) : (
            <Suspense fallback={<PanelSkeleton />}>
              <DiagnosisPanel sku={sku} sub_channel={sub_channel} />
            </Suspense>
          )}
        </div>
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
