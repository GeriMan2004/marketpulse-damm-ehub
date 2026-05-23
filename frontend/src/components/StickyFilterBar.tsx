/**
 * StickyFilterBar — Dub's analytics-page filter bar pattern.
 *
 * Behavior copied from apps/web/ui/analytics in dub.co:
 *   - Filters sit in a sticky bar at the top of the page (always visible
 *     when scrolling so the user can re-cut data without scrolling back up).
 *   - State is mirrored to URL search params (so deep-links survive).
 *   - Each filter renders as a small chip with a value or "All", and
 *     opens a popover with options on click.
 *   - "Reset" link clears everything in one click.
 */

import { useSearchParams } from "react-router-dom"
import { useMeta } from "@/lib/hooks"
import { ChevronDown, X } from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export function StickyFilterBar() {
  const { data: meta } = useMeta()
  const [params, setParams] = useSearchParams()

  const sku = params.get("sku") ?? null
  const sub_channel = params.get("sub_channel") ?? null
  const brand = params.get("brand") ?? null

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const reset = () => setParams(new URLSearchParams(), { replace: true })

  const skuLabel = meta?.skus.find(s => s.id === sku)?.label
  const channelLabel = meta?.sub_channels_labeled.find(c => c.code === sub_channel)?.label
  const hasFilters = !!(sku || sub_channel || brand)

  return (
    <div className="sticky top-14 z-10 -mx-8 px-8 py-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-center gap-2 flex-wrap">

        {/* BRAND FILTER */}
        <FilterChip
          label="Brand"
          value={brand}
          onClear={() => update("brand", null)}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={chipBtn(!!brand)}>
                <span className="text-muted-foreground">Brand</span>
                {brand && <span className="text-foreground font-medium">· {brand}</span>}
                <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto w-56">
              <DropdownMenuLabel className="text-xs">Brand</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => update("brand", null)}>All brands</DropdownMenuItem>
              {meta?.brands.map(b => (
                <DropdownMenuItem key={b} onSelect={() => update("brand", b)}>
                  {b}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </FilterChip>

        {/* SUB_CHANNEL FILTER */}
        <FilterChip
          label="Sub-channel"
          value={channelLabel ?? null}
          onClear={() => update("sub_channel", null)}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={chipBtn(!!sub_channel)}>
                <span className="text-muted-foreground">Sub-channel</span>
                {channelLabel && <span className="text-foreground font-medium">· {channelLabel}</span>}
                <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="text-xs">Sub-channel</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => update("sub_channel", null)}>All sub-channels</DropdownMenuItem>
              {meta?.sub_channels_labeled.map(c => (
                <DropdownMenuItem key={c.code} onSelect={() => update("sub_channel", c.code)}>
                  {c.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </FilterChip>

        {/* SKU FILTER */}
        <FilterChip
          label="SKU"
          value={skuLabel ?? sku ?? null}
          onClear={() => update("sku", null)}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={chipBtn(!!sku)}>
                <span className="text-muted-foreground">SKU</span>
                {(skuLabel || sku) && (
                  <span className="text-foreground font-medium truncate max-w-[220px]">
                    · {skuLabel ?? sku}
                  </span>
                )}
                <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto w-80">
              <DropdownMenuLabel className="text-xs">SKU</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => update("sku", null)}>All SKUs</DropdownMenuItem>
              {meta?.skus
                .filter(s => !brand || s.brand === brand)
                .slice(0, 80)
                .map(s => (
                <DropdownMenuItem key={s.id} onSelect={() => update("sku", s.id)}>
                  <span className="truncate">{s.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </FilterChip>

        <div className="flex-1" />

        {hasFilters && (
          <button
            onClick={reset}
            className="text-xs text-muted-foreground hover:text-foreground transition flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Clear filters
          </button>
        )}
      </div>
    </div>
  )
}

function chipBtn(active: boolean) {
  return cn(
    "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition",
    active
      ? "border-primary/60 bg-primary/10 text-foreground"
      : "border-border bg-card hover:bg-accent/40 hover:border-border/80 text-foreground"
  )
}

function FilterChip({ children }: { label: string; value: string | null; onClear: () => void; children: React.ReactNode }) {
  // Wrapper hook for future "active indicator" or "remove ×" UI
  return <div className="inline-flex">{children}</div>
}
