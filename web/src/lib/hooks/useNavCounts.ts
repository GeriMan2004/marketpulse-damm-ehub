"use client"

/**
 * Tiny hooks that feed the sidebar nav badges.
 *
 *   useUpcomingCallsCount() → how many customer calls Sarah has coming up,
 *                             for the Inbox badge. Synchronous — the calls
 *                             list lives in calls.ts, no fetch needed.
 *   usePromoLibrarySize()   → number of promo types in the historical
 *                             library, for the Promos badge.
 */

import useSWR from "swr"
import { UPCOMING_CALLS } from "@/lib/calls"
import type { components } from "@/lib/api.gen"

type PromoROI = components["schemas"]["PromoROI"]

async function jsonFetcher<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/**
 * Count of upcoming meetings (days_from_now >= 0). The list is fixed
 * client-side data so this is a pure derivation — no SWR needed.
 */
export function useUpcomingCallsCount(): number {
  return UPCOMING_CALLS.filter((c) => c.days_from_now >= 0).length
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
