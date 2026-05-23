"use client"

/**
 * Tab strip for the decision page. Pure navigation — clicking a tab updates
 * the `?tab=` URL param, which triggers an RSC re-render on the server with
 * only the active panel.
 *
 * Why not render all three children at once: previously we passed every
 * panel into <TabsContent>, which let Radix hide the inactive ones with
 * display:none. Recharts' ResponsiveContainer measured zero-width inside
 * the hidden parents and warned "width(-1) and height(-1)". And we paid
 * for the LLM recommend call even when the user never visited Options.
 *
 * Now each tab switch is a navigation. Suspense + RSC keeps it instant.
 */

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"

type Slot = "diagnosis" | "options" | "simulate"

const TABS: { value: Slot; label: string; n: number }[] = [
  { value: "diagnosis", label: "Diagnosis", n: 1 },
  { value: "options",   label: "Options",   n: 2 },
  { value: "simulate",  label: "Simulate",  n: 3 },
]

export function DecisionTabs({ active }: { active: Slot }) {
  const search = useSearchParams()

  function hrefFor(value: Slot): string {
    const next = new URLSearchParams(search.toString())
    next.set("tab", value)
    return `?${next.toString()}`
  }

  return (
    <div
      role="tablist"
      className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white p-1"
    >
      {TABS.map((t) => {
        const isActive = t.value === active
        return (
          <Link
            key={t.value}
            href={hrefFor(t.value)}
            scroll={false}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "inline-flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-neutral-100 text-neutral-900"
                : "text-neutral-500 hover:text-neutral-900",
            )}
          >
            <span
              className={cn(
                "inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-medium",
                isActive ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-500",
              )}
            >
              {t.n}
            </span>
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
