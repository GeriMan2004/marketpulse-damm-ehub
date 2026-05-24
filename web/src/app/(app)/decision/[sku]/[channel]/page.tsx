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
import { asCustomer, CUSTOMER_LABELS, gapMatchesCustomer } from "@/lib/calls"
import { DiagnosisPanel } from "./diagnosis-panel"
import { SimulatePanel } from "./simulate-panel"

type Meta = components["schemas"]["MetaResponse"]
type GapItem = components["schemas"]["GapItem"]

export default async function DecisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string; channel: string }>
  searchParams: Promise<{ period?: string; tab?: string; granularity?: string; customer?: string }>
}) {
  const { sku: skuRaw, channel: channelRaw } = await params
  const { period, tab, granularity: granRaw, customer: customerRaw } = await searchParams
  const granularity: "month" | "week" = granRaw === "week" ? "week" : "month"
  const sku = decodeURIComponent(skuRaw)
  const sub_channel = decodeURIComponent(channelRaw)
  const customer = asCustomer(customerRaw)

  // Match the home-page query so the per-customer arithmetic lines up
  // (default `/api/gap` caps at 50 rows + min_quality=0.25 and would
  // silently drop months the drawer counted).
  const [meta, gaps] = await Promise.all([
    serverFetch<Meta>("/api/meta"),
    serverFetch<GapItem[]>("/api/gap?limit=2000&min_quality=0"),
  ])

  // Scope to the SKU × channel. If a customer is in the URL, also restrict
  // to the months that customer "owns" — same predicate the drawer uses,
  // so the chip total exactly matches the card the user clicked.
  const matchingGaps = gaps
    .filter((g) => g.sku === sku && g.sub_channel === sub_channel)
    .filter((g) => (customer ? gapMatchesCustomer(g, customer) : true))
  const currentGap = period
    ? matchingGaps.find((g) => g.period === period) ?? matchingGaps[0]
    : matchingGaps[0]
  const targetPeriod = currentGap?.period ?? period

  const VALID_TABS = ["diagnosis", "simulate"] as const
  type TabSlot = (typeof VALID_TABS)[number]
  const activeTab: TabSlot = (VALID_TABS as readonly string[]).includes(tab ?? "")
    ? (tab as TabSlot)
    : "diagnosis"

  // Header chip is scoped to the *direction* of the period the user
  // clicked through on — a SKU can be ahead in some months and behind
  // in others; summing across both nets to a number that contradicts
  // the home-page card (which is also direction-scoped). If we have no
  // currentGap (deep link from elsewhere), fall back to the worst miss
  // so the chip stays informative.
  const headerDirection: "win" | "loss" =
    currentGap && currentGap.gap_hl > 0 ? "win" : "loss"
  const directionGaps = matchingGaps.filter((g) =>
    headerDirection === "win" ? g.gap_hl > 0 : g.gap_hl < 0,
  )
  const monthsInDirection = directionGaps.length
  const extremeGap = directionGaps.length > 0
    ? directionGaps.reduce((a, b) =>
        headerDirection === "win"
          ? (a.gap_pct > b.gap_pct ? a : b)
          : (a.gap_pct < b.gap_pct ? a : b),
      )
    : null
  const totalGapGbp = directionGaps.reduce<number | null>((s, g) => {
    if (g.gap_gbp == null) return s
    return (s ?? 0) + g.gap_gbp
  }, null)

  const headerTitle = (
    <span className="flex items-baseline gap-2 min-w-0">
      <span className="truncate">{skuLabel(meta, sku)}</span>
      {monthsInDirection > 0 && extremeGap && totalGapGbp != null && (
        <span
          className="hidden md:inline text-[13px] font-medium tabular-nums shrink-0"
          style={{ color: gapColor(extremeGap.gap_pct) }}
        >
          {headerDirection === "win" ? "+" : "−"}
          {formatGBP(Math.abs(totalGapGbp))}
          <span className="ml-1 font-normal text-neutral-400">
            · {monthsInDirection}mo {headerDirection === "win" ? "ahead" : "at risk"}
            {customer ? ` · ${CUSTOMER_LABELS[customer]}` : ""}
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
