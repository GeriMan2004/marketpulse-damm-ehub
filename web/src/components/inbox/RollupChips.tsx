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
        // Right-edge fade so the inevitable mid-chip cut at the viewport
        // edge reads as "there's more, scroll →" rather than a rendering
        // bug. The mask softens the last ~24px of the strip without
        // affecting the chips themselves.
        <div
          className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          style={{
            maskImage:
              "linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 24px), transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 24px), transparent 100%)",
          }}
        >
          {/* Vertical padding on the rail so the border doesn't sit flush
              against neighbouring rows and look truncated. */}
          <div className="flex gap-1.5 px-4 py-1">
            {items.map((it) => (
              <Chip key={it.label} {...it} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function Chip({ label, gap_pct, gap_gbp }: ChipItem) {
  const tone = gapColor(gap_pct)
  return (
    // Inset `border` instead of `ring` — ring renders outside the box and
    // gets clipped at the edges of the scroll container; border is part
    // of the box and survives clean. Single line: label · £ · %.
    <div className="shrink-0 inline-flex items-baseline gap-3 rounded-lg bg-white border border-neutral-200 px-3.5 py-2.5 hover:bg-neutral-50 transition-colors">
      <span className="text-[12.5px] font-medium text-neutral-900 truncate">
        {label}
      </span>
      <span className="text-[11px] text-neutral-500 tabular-nums">
        {gap_gbp != null ? `≈ ${formatGBP(gap_gbp)}` : "—"}
      </span>
      <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: tone }}>
        {formatPercent(gap_pct, 1)}
      </span>
    </div>
  )
}
