/**
 * Triage Inbox — home base for a UK Commercial Manager.
 *
 * Layout shape:
 *   [ Welcome back, Sarah ]
 *   [ MonthCalendar — full-page hero, customer calls as day chips ]
 *
 * When the user clicks a call chip, `?customer=X` appears in the URL and
 * AtRiskDrawer pops up from the bottom showing the SKUs at risk for that
 * customer. The calendar stays visible behind a dim backdrop. Dismiss
 * removes the query param.
 */

import Link from "next/link"
import { Suspense } from "react"
import { ArrowRight, CornerDownRight, Package } from "lucide-react"
import { PageContent } from "@/components/shell/PageContent"
import { PageWidthWrapper } from "@/components/shell/PageWidthWrapper"
import { Skeleton } from "@/components/ui/skeleton"
import { Sparkline } from "@/components/ui/sparkline"
import { serverFetch } from "@/lib/api"
import { formatGBP, formatHl, gapTone, formatPeriod } from "@/lib/format"
import { skuLabel, channelLabel } from "@/lib/meta"
import {
  CUSTOMER_LABELS,
  UPCOMING_CALLS,
  asCustomer,
  gapMatchesCustomer,
  type Customer,
} from "@/lib/calls"
import { MonthCalendar } from "@/components/inbox/MonthCalendar"
import { AtRiskDrawer } from "@/components/inbox/AtRiskDrawer"
import { UkPulseHero } from "@/components/inbox/UkPulseHero"
import { RollupChips } from "@/components/inbox/RollupChips"
import type { components } from "@/lib/api.gen"

type GapItem = components["schemas"]["GapItem"]
type Meta = components["schemas"]["MetaResponse"]

/** One row in the at-risk drawer — aggregated across all months this SKU
 *  is forecast below target, with the worst single month kept for the
 *  deep-link target so the user lands on the most informative period. */
type AtRiskAggregateRow = {
  sku: string
  sub_channel: string
  worst: GapItem            // worst-gap month (for click destination + label)
  monthsAtRisk: number      // how many months in the horizon are negative
  totalGapHl: number        // sum of gap_hl across those months
  totalGapGbp: number | null
  history_hl: number[]
}
type Pulse = components["schemas"]["Pulse"]
type BrandRollup = components["schemas"]["BrandRollup"]
type SubChannelRollup = components["schemas"]["SubChannelRollup"]

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const { customer: customerParam } = await searchParams
  const customer = asCustomer(customerParam)

  return (
    <PageContent
      className="h-full"
      contentWrapperClassName="min-h-0 flex flex-col"
    >
      <PageWidthWrapper className="flex-1 min-h-0 flex flex-col">
        <Suspense fallback={<InboxSkeleton />}>
          <Inbox customer={customer} />
        </Suspense>
      </PageWidthWrapper>
    </PageContent>
  )
}

async function Inbox({ customer }: { customer: Customer | null }) {
  // Parallel-fetch everything the home page needs. Pulse + rollups are
  // scoped to the same period the pulse endpoint picks (current/upcoming
  // month) so the brand & channel chips agree with the headline number.
  const [gaps, meta, pulse, brands, channels] = await Promise.all([
    // limit=2000 + min_quality=0 returns the full slate (losses AND
    // wins) so the customer drawer can show both sides of the basket.
    // /api/gap's default `limit=50` sorted gap_hl_asc would only return
    // the 50 worst losses system-wide, never reaching positive rows.
    serverFetch<GapItem[]>("/api/gap?limit=2000&min_quality=0"),
    serverFetch<Meta>("/api/meta"),
    serverFetch<Pulse>("/api/pulse").catch(() => null),
    serverFetch<BrandRollup[]>("/api/forecast/by-brand?limit=8").catch(() => []),
    serverFetch<SubChannelRollup[]>("/api/forecast/by-sub-channel").catch(() => []),
  ])

  const pulsePeriod = pulse?.period
  // Scope the rollups to the pulse period if we have one — otherwise show
  // the full-horizon view as a fallback.
  const [brandsScoped, channelsScoped] = pulsePeriod
    ? await Promise.all([
        serverFetch<BrandRollup[]>(
          `/api/forecast/by-brand?limit=8&period=${encodeURIComponent(pulsePeriod)}`,
        ).catch(() => brands),
        serverFetch<SubChannelRollup[]>(
          `/api/forecast/by-sub-channel?period=${encodeURIComponent(pulsePeriod)}`,
        ).catch(() => channels),
      ])
    : [brands, channels]

  // For the drawer — aggregate per (SKU × sub_channel) across all
  // matching months in the horizon. Wins and losses are aggregated
  // SEPARATELY: a SKU might be ahead in Jul AND behind in Oct/Nov, so
  // it can legitimately appear in BOTH sections (different commercial
  // conversations: "let's lock the Jul volume" vs "what about Oct?").
  // The "worst" field is the most-extreme month in that direction —
  // most negative for losses (worst miss), most positive for wins
  // (best ahead) — and powers the deep-link to the decision page.
  function aggregateForCustomer(
    direction: "loss" | "win",
  ): AtRiskAggregateRow[] {
    if (!customer) return []
    const filtered = gaps.filter(
      (g) =>
        gapMatchesCustomer(g, customer) &&
        (direction === "loss" ? g.gap_hl < 0 : g.gap_hl > 0),
    )
    const bySku = new Map<string, AtRiskAggregateRow>()
    for (const g of filtered) {
      const key = `${g.sku}|${g.sub_channel}`
      const cur = bySku.get(key)
      if (!cur) {
        bySku.set(key, {
          sku: g.sku,
          sub_channel: g.sub_channel,
          worst: g,
          monthsAtRisk: 1,
          totalGapHl: g.gap_hl,
          totalGapGbp: g.gap_gbp ?? null,
          history_hl: g.history_hl ?? [],
        })
      } else {
        cur.monthsAtRisk += 1
        cur.totalGapHl += g.gap_hl
        if (g.gap_gbp != null) {
          cur.totalGapGbp = (cur.totalGapGbp ?? 0) + g.gap_gbp
        }
        const isMoreExtreme =
          direction === "loss"
            ? g.gap_hl < cur.worst.gap_hl
            : g.gap_hl > cur.worst.gap_hl
        if (isMoreExtreme) cur.worst = g
      }
    }
    // Worst losses first (most-negative); biggest wins first (most-positive).
    return [...bySku.values()].sort((a, b) =>
      direction === "loss" ? a.totalGapHl - b.totalGapHl : b.totalGapHl - a.totalGapHl,
    )
  }

  const negatives: AtRiskAggregateRow[] = aggregateForCustomer("loss")
  const positives: AtRiskAggregateRow[] = aggregateForCustomer("win")

  // Prefer the soonest UPCOMING call for this customer — past meetings live
  // in the list too (for the calendar's "done" chips) and otherwise win the
  // `find` race because they sort earlier.
  const activeCall = customer
    ? UPCOMING_CALLS
        .filter((c) => c.customer === customer && c.days_from_now >= 0)
        .sort((a, b) => a.days_from_now - b.days_from_now)[0] ?? null
    : null

  return (
    <div className="h-full flex flex-col min-h-0 pb-2 gap-5">
      <header className="shrink-0 flex items-baseline justify-between gap-4 flex-wrap">
        <h1 className="font-serif text-[40px] leading-[1.05] tracking-[-0.02em] text-neutral-900">
          Welcome back, Sarah
        </h1>
        <p className="font-serif text-[32px] leading-none tracking-[-0.01em] text-neutral-900">
          {new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        </p>
      </header>

      {/* Portfolio strip — pulse hero on the left, brand + channel rollups
          stacked on the right. Reads as "headline → evidence" left-to-right.
          Stacks vertically on narrow viewports. */}
      <div className="shrink-0 grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-y-6 gap-x-0 items-stretch">
        {pulse && <UkPulseHero pulse={pulse} />}
        <div className="flex flex-col gap-5 min-w-0">
          <RollupChips
            heading="By brand"
            items={brandsScoped.map((b) => ({
              label: titleCaseBrand(b.brand),
              gap_pct: b.gap_pct,
              gap_gbp: b.gap_gbp,
            }))}
            emptyHint="No brand data for this period."
          />
          <RollupChips
            heading="By channel"
            items={channelsScoped.map((c) => ({
              label: c.name,
              gap_pct: c.gap_pct,
              gap_gbp: c.gap_gbp,
            }))}
            emptyHint="No channel data for this period."
          />
        </div>
      </div>

      {/* Calendar — Sarah's day-by-day call schedule sits underneath the
          portfolio view so the brief-aligned headline numbers lead. */}
      <MonthCalendar gaps={gaps} activeCustomer={customer} />

      {/* Bottom-sheet drawer — only mounted when a customer is selected. */}
      {customer && (
        <AtRiskDrawer
          customerLabel={CUSTOMER_LABELS[customer]}
          customerKey={customer}
          daysFromNow={activeCall?.days_from_now ?? null}
          weekday={
            activeCall ? WEEKDAYS[new Date(activeCall.date_iso).getDay()] : null
          }
        >
          {negatives.length === 0 && positives.length === 0 ? (
            <div className="py-10 text-center text-sm text-neutral-500">
              No movement either way for this customer — flat YoY.
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <DrawerSection
                label="Behind plan"
                hint="Lead with these — they need an ask"
                rows={negatives}
                direction="loss"
                meta={meta}
                emptyHint="Nothing behind plan — they're growing across the basket."
              />
              <DrawerSection
                label="Ahead of plan"
                hint="Talking points — acknowledge before pivoting to misses"
                rows={positives}
                direction="win"
                meta={meta}
                emptyHint="No wins to acknowledge — every SKU is below YoY."
              />
            </div>
          )}
        </AtRiskDrawer>
      )}
    </div>
  )
}

const TONE_PILL: Record<ReturnType<typeof gapTone>, string> = {
  critical: "border-[var(--critical)]/30 bg-[var(--critical)]/10 text-[var(--critical)]",
  bad:      "border-[var(--negative)]/30 bg-[var(--negative)]/10 text-[var(--negative)]",
  warn:     "border-[var(--warn)]/30 bg-[var(--warn)]/10 text-[var(--warn)]",
  good:     "border-[var(--positive)]/30 bg-[var(--positive)]/10 text-[var(--positive)]",
  neutral:  "border-neutral-200 bg-neutral-50 text-neutral-700",
}

const TONE_ICON: Record<ReturnType<typeof gapTone>, string> = {
  critical: "text-[var(--critical)]",
  bad:      "text-[var(--negative)]",
  warn:     "text-[var(--warn)]",
  good:     "text-[var(--positive)]",
  neutral:  "text-neutral-500",
}

function DrawerSection({
  label,
  hint,
  rows,
  direction,
  meta,
  emptyHint,
}: {
  label: string
  hint: string
  rows: AtRiskAggregateRow[]
  direction: "loss" | "win"
  meta: Meta
  emptyHint: string
}) {
  return (
    <section>
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-neutral-700">
            {label}
          </h3>
          {rows.length > 0 && (
            <span className="text-[11px] tabular-nums text-neutral-400">{rows.length}</span>
          )}
        </div>
        <span className="text-[11px] text-neutral-400">{hint}</span>
      </header>
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-neutral-500 italic">{emptyHint}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <InboxRow
              key={`${row.sku}-${row.sub_channel}`}
              row={row}
              meta={meta}
              direction={direction}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function InboxRow({
  row,
  meta,
  direction,
}: {
  row: AtRiskAggregateRow
  meta: Meta
  direction: "loss" | "win"
}) {
  // The row's pill colour tracks the *most-extreme month* tone — for
  // losses that's the deepest miss; for wins it's the biggest beat.
  const tone = gapTone(row.worst.gap_pct)
  // Deep-link to the most-extreme month — the decision page lands on
  // the most informative period for this SKU × channel.
  const href = `/decision/${encodeURIComponent(row.sku)}/${encodeURIComponent(
    row.sub_channel,
  )}?period=${encodeURIComponent(row.worst.period)}`

  // Subtitle copy varies by direction: "at risk" / "worst MMM" for
  // losses, "ahead" / "best MMM" for wins. Singular/plural is
  // grammar-aware ("1 month" vs "N months").
  const isWin = direction === "win"
  const noun = isWin ? "ahead" : "at risk"
  const superlative = isWin ? "best" : "worst"
  const monthsPhrase =
    row.monthsAtRisk === 1
      ? `1 month ${noun} · ${formatPeriod(row.worst.period)}`
      : `${row.monthsAtRisk} months ${noun} · ${superlative} ${formatPeriod(row.worst.period)}`

  return (
    <li>
      <Link
        href={href as Parameters<typeof Link>[0]["href"]}
        className="group block rounded-xl border border-neutral-200 bg-white px-4 py-3 transition-colors hover:border-neutral-300 hover:bg-neutral-50/60"
      >
        <div className="flex items-center gap-4">
          {/* Left — circular SKU icon, dub-style ring with gradient */}
          <div className="relative size-9 shrink-0">
            <div className="absolute inset-0 rounded-full border border-neutral-200">
              <div className="h-full w-full rounded-full border border-white bg-gradient-to-t from-neutral-100" />
            </div>
            <div className="relative flex h-full w-full items-center justify-center">
              <Package className={`h-4 w-4 ${TONE_ICON[tone]}`} />
            </div>
          </div>

          {/* Middle — title + ↳ secondary */}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold leading-6 text-neutral-800 group-hover:text-neutral-950">
              {skuLabel(meta, row.sku)}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[12px] text-neutral-500">
              <CornerDownRight className="h-3 w-3 shrink-0 text-neutral-400" />
              <span className="truncate">
                {channelLabel(meta, row.sub_channel)} · {monthsPhrase}
              </span>
            </div>
          </div>

          {/* Right — sparkline + cumulative-£ pill + chevron */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden md:block">
              <Sparkline data={row.history_hl ?? []} width={88} positive={row.totalGapHl > 0} />
            </div>
            <div
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium tabular-nums ${TONE_PILL[tone]}`}
            >
              {row.totalGapGbp != null ? (
                <span>≈ {formatGBP(row.totalGapGbp)}</span>
              ) : (
                <span>{formatHl(row.totalGapHl)}</span>
              )}
              <span className="opacity-50">·</span>
              <span>{row.monthsAtRisk}mo</span>
            </div>
            <ArrowRight className="h-4 w-4 text-neutral-400 transition-colors group-hover:text-neutral-700" />
          </div>
        </div>
      </Link>
    </li>
  )
}

/** Brand names ship in screaming caps from the source data. */
function titleCaseBrand(brand: string): string {
  return brand
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
}

function InboxSkeleton() {
  return (
    <div className="mt-2">
      <Skeleton className="h-10 w-80 mb-8" />
      <Skeleton className="h-6 w-40 mb-3" />
      <Skeleton className="flex-1 w-full rounded-xl" />
    </div>
  )
}
