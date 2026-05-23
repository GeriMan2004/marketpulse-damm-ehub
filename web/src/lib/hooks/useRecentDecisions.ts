"use client"

/**
 * Recently-visited decision pages, persisted in localStorage.
 *
 * Capped at 5 entries, deduped by `sku × sub_channel`. The decision page
 * writes here via <RecentDecisionTracker />; the sidebar reads here to
 * render the RECENT section.
 *
 * Cross-component sync: writes dispatch a CustomEvent on `window` so the
 * sidebar updates without needing a route change. The browser-built-in
 * "storage" event only fires across tabs, not within a tab, so we add
 * our own.
 */

import { useEffect, useState } from "react"

export type RecentDecision = {
  sku: string
  sub_channel: string
  period?: string
  sku_label?: string
  channel_label?: string
  visited_at: number     // unix ms
}

const KEY = "ramp:recent-decisions"
const CAP = 5
const EVENT_NAME = "ramp:recent-decisions-changed"

function safeRead(): RecentDecision[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is RecentDecision =>
        !!r && typeof r === "object" &&
        typeof (r as RecentDecision).sku === "string" &&
        typeof (r as RecentDecision).sub_channel === "string",
    )
  } catch {
    return []
  }
}

function safeWrite(entries: RecentDecision[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries))
    window.dispatchEvent(new Event(EVENT_NAME))
  } catch {
    /* quota or private mode — swallow */
  }
}

/** Record a visit. Idempotent within the same SKU×channel — updates the timestamp. */
export function recordRecentDecision(entry: Omit<RecentDecision, "visited_at">): void {
  const current = safeRead()
  const filtered = current.filter(
    (r) => !(r.sku === entry.sku && r.sub_channel === entry.sub_channel),
  )
  const next: RecentDecision[] = [
    { ...entry, visited_at: Date.now() },
    ...filtered,
  ].slice(0, CAP)
  safeWrite(next)
}

/** Subscribe to the list of recent decisions; re-renders when it changes. */
export function useRecentDecisions(): RecentDecision[] {
  const [list, setList] = useState<RecentDecision[]>([])

  useEffect(() => {
    setList(safeRead())
    const onChange = () => setList(safeRead())
    window.addEventListener(EVENT_NAME, onChange)
    window.addEventListener("storage", onChange)
    return () => {
      window.removeEventListener(EVENT_NAME, onChange)
      window.removeEventListener("storage", onChange)
    }
  }, [])

  return list
}
