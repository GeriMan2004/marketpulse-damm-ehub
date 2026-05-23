"use client"

/**
 * Tiny SWR hooks that feed the sidebar nav badges.
 *
 *   useCriticalGapCount()  → how many SKUs are in the critical tier (≤ -25%)
 *                            for the Inbox badge.
 *   usePromoLibrarySize()  → number of promo types in the historical library,
 *                            for the Promos badge.
 *
 * Both endpoints are already cached server-side; these calls are cheap.
 */

import useSWR from "swr"
import type { components } from "@/lib/api.gen"

type GapItem = components["schemas"]["GapItem"]
type PromoROI = components["schemas"]["PromoROI"]

const CRITICAL_THRESHOLD = -0.25

async function jsonFetcher<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export function useCriticalGapCount(): number | null {
  // Pull up to 200 rows; the threshold filter is what we actually care about.
  const { data } = useSWR<GapItem[] | null>(
    "/api/gap?limit=200",
    jsonFetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  )
  if (!data) return null
  return data.filter((g) => g.gap_pct <= CRITICAL_THRESHOLD).length
}

export function usePromoLibrarySize(): number | null {
  const { data } = useSWR<PromoROI[] | null>(
    "/api/promos/roi",
    jsonFetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  )
  if (!data) return null
  return data.length
}
