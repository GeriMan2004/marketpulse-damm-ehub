/**
 * RollupChips — horizontal user-scrollable strip of brand or channel cards.
 *
 * Edge-fade gradients (mask-image) on left/right hint that more items exist
 * past the viewport, replacing the visual role of a scrollbar. No auto-scroll
 * — the user drags or swipes through.
 *
 * The brief asks the tool to "prioritize brand, channel, promotion or
 * commercial effort" — these chips are the brand and channel half of that.
 */

import { formatGBP, formatPercent, gapColor } from "@/lib/format"

type ChipItem = {
  label: string
  gap_pct: number
  /** Optional £ impact for the period. Hidden when null/undefined. */
  gap_gbp?: number | null
}

export function RollupChips({
  heading,
  items,
  emptyHint,
}: {
  heading: string
  items: ChipItem[]
  emptyHint?: string
}) {
  return (
    <section aria-label={heading} className="min-w-0">
      <h3 className="mb-2 pl-4 text-[10.5px] uppercase tracking-[0.18em] text-neutral-500 font-medium">
        {heading}
      </h3>

      {items.length === 0 ? (
        <p className="pl-4 text-[12px] text-neutral-500">{emptyHint ?? "—"}</p>
      ) : (
        // Borderless chip rail on a soft recessed surface: secondary
        // content recedes underneath the shadowed hero card, with the
        // same horizontal swipe affordance as before.
        <div className="flex gap-1.5 pl-4 pr-4 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {items.map((it) => (
            <Chip key={it.label} {...it} />
          ))}
        </div>
      )}
    </section>
  )
}

function Chip({ label, gap_pct, gap_gbp }: ChipItem) {
  const tone = gapColor(gap_pct)
  return (
    // No border. Surface is bg-neutral-50/70 so the chip reads as a
    // recessed pill against the page rather than a peer to the hero card.
    // Single horizontal line: label · £ · % — the brand/channel name
    // leads, the £ provides material context, the % is the sharp number.
    <div className="shrink-0 inline-flex items-baseline gap-3 rounded-lg bg-neutral-50/70 px-3 py-2 hover:bg-neutral-100/80 transition-colors">
      <span className="text-[12.5px] font-medium text-neutral-700 truncate">
        {label}
      </span>
      <span className="text-[11px] text-neutral-400 tabular-nums">
        {gap_gbp != null ? `≈ ${formatGBP(gap_gbp)}` : "—"}
      </span>
      <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: tone }}>
        {formatPercent(gap_pct, 1)}
      </span>
    </div>
  )
}
