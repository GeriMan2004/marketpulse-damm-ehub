"use client"

/**
 * Side-effect-only component. Mount inside the decision page; it records
 * the visit to the localStorage-backed "Recent" list that the Sidebar
 * reads. Renders nothing.
 */

import { useEffect } from "react"
import { recordRecentDecision } from "@/lib/hooks/useRecentDecisions"

export function RecentDecisionTracker({
  sku,
  sub_channel,
  period,
  sku_label,
  channel_label,
}: {
  sku: string
  sub_channel: string
  period?: string
  sku_label?: string
  channel_label?: string
}) {
  useEffect(() => {
    recordRecentDecision({ sku, sub_channel, period, sku_label, channel_label })
  }, [sku, sub_channel, period, sku_label, channel_label])
  return null
}
