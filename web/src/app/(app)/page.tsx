/**
 * Triage Inbox — home base for a UK Commercial Manager.
 *
 * Quiet by design: one subtitle line + a worklist. No metric tiles — this is
 * a list of things to do, not a dashboard about how things are going.
 */

import Link from "next/link"
import { Suspense } from "react"
import { ArrowRight } from "lucide-react"
import { PageContent } from "@/components/shell/PageContent"
import { PageWidthWrapper } from "@/components/shell/PageWidthWrapper"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { serverFetch } from "@/lib/api"
import { formatHl, formatPercent, gapTone, formatPeriod } from "@/lib/format"
import { skuLabel, channelLabel } from "@/lib/meta"
import type { components } from "@/lib/api.gen"

type GapItem = components["schemas"]["GapItem"]
type Meta = components["schemas"]["MetaResponse"]

export default function Page() {
  return (
    <PageContent title="Inbox">
      <PageWidthWrapper className="pb-10 pt-2">
        <Suspense fallback={<InboxSkeleton />}>
          <Inbox />
        </Suspense>
      </PageWidthWrapper>
    </PageContent>
  )
}

async function Inbox() {
  const [gaps, meta] = await Promise.all([
    serverFetch<GapItem[]>("/api/gap"),
    serverFetch<Meta>("/api/meta"),
  ])

  const negatives = gaps
    .filter((g) => g.gap_hl < 0)
    .sort((a, b) => a.gap_hl - b.gap_hl)
    .slice(0, 20)

  const positives = gaps
    .filter((g) => g.gap_hl > 0)
    .sort((a, b) => b.gap_hl - a.gap_hl)
    .slice(0, 5)

  const totalGapHl = negatives.reduce((s, g) => s + g.gap_hl, 0)
  const negCount = gaps.filter((g) => g.gap_hl < 0).length

  return (
    <>
      {/* Single quiet context line — replaces the noisy 3 metric tiles */}
      <p className="text-sm text-neutral-500">
        <span className="text-neutral-900 font-medium">{negCount}</span> SKUs behind target,
        total gap{" "}
        <span className="text-neutral-900 font-medium tabular-nums">
          {formatHl(totalGapHl)}
        </span>
        . {positives.length > 0 && (
          <>
            <span className="text-neutral-900 font-medium">{positives.length}</span> ahead.
          </>
        )}
      </p>

      <Section title="Action queue" subtitle={`${negatives.length} items · sorted by impact`}>
        <ul className="divide-y divide-neutral-200">
          {negatives.map((g) => (
            <InboxRow key={`${g.sku}-${g.sub_channel}-${g.period}`} gap={g} meta={meta} />
          ))}
        </ul>
      </Section>

      {positives.length > 0 && (
        <Section title="Tailwinds" subtitle="Ahead of plan — protect, don't disturb">
          <ul className="divide-y divide-neutral-200">
            {positives.map((g) => (
              <InboxRow key={`${g.sku}-${g.sub_channel}-${g.period}-pos`} gap={g} meta={meta} positive />
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

function Section({
  title, subtitle, children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-neutral-900">{title}</h3>
        <div className="text-[11.5px] text-neutral-500">{subtitle}</div>
      </div>
      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">{children}</div>
    </section>
  )
}

function InboxRow({ gap, meta, positive: _positive }: { gap: GapItem; meta: Meta; positive?: boolean }) {
  const tone = gapTone(gap.gap_pct)
  const badgeVariant =
    tone === "negative" ? "negative" : tone === "positive" ? "positive" : tone === "warn" ? "warn" : "outline"
  const href = `/decision/${encodeURIComponent(gap.sku)}/${encodeURIComponent(
    gap.sub_channel,
  )}?period=${encodeURIComponent(gap.period)}`

  return (
    <li>
      <Link
        href={href as Parameters<typeof Link>[0]["href"]}
        className="block px-4 py-3 hover:bg-neutral-50 transition-colors group"
      >
        <div className="flex items-center gap-4">
          <div className="w-20 shrink-0">
            <Badge variant={badgeVariant} className="text-[11px] px-2 py-0.5">
              {formatPercent(gap.gap_pct, 0)}
            </Badge>
            <div className="text-[10px] text-neutral-500 tabular-nums mt-0.5">
              {formatHl(gap.gap_hl)}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-neutral-900 truncate">
              {skuLabel(meta, gap.sku)}
            </div>
            <div className="text-[11.5px] text-neutral-500 truncate mt-0.5">
              {channelLabel(meta, gap.sub_channel)} · {formatPeriod(gap.period)} · forecast {formatHl(gap.forecast_hl)} vs target {formatHl(gap.budget_hl)}
            </div>
          </div>

          <div className="hidden md:block">
            <Badge variant="outline" className="capitalize">
              {gap.confidence}
            </Badge>
          </div>

          <div className="text-neutral-400 group-hover:text-neutral-700 transition-colors shrink-0">
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </Link>
    </li>
  )
}

function InboxSkeleton() {
  return (
    <div className="mt-2">
      <Skeleton className="h-4 w-80 mb-6" />
      <Skeleton className="h-5 w-32 mb-3" />
      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-4 py-3 border-b border-neutral-200 last:border-0">
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
