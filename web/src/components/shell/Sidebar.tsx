"use client"

/**
 * Sidebar — two-column shape ported from Dub consumer's sidebar-nav.tsx.
 *
 * Source: apps/web/ui/layout/sidebar/sidebar-nav.tsx (the two-pane variant)
 *
 *   <aside w-[304px] bg-neutral-200>
 *     [64px rail]
 *       <Logo>            (top — brand mark)
 *       <WorkspaceBadge>  (single-workspace chip)
 *           ─ spacer ─
 *       <UserAvatar>      (bottom — opens account popover)
 *
 *     [240px areas card]  (the "Workflow" card — does the heavy lifting)
 *       <h3 "Workflow">
 *       <NavItem Inbox    | badge: critical gap count>
 *       <NavItem Promos   | badge: library size>
 *       <NavItem Ask>
 *       ─ "RECENT" ─
 *       <RecentRow x 5>                       ← localStorage-backed
 *       ─ "MARKET PULSE" ─
 *       <NewsCard x 20>                       ← scrolls independently
 *       ─ status footer ─
 *       <"News synced 2m ago / Model v0.3.2">
 *
 * The whole right column is one card; sections are separated by an
 * uppercase label (no dividers). Linear / Plain do the same.
 */

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import {
  Inbox, Tag, MessageSquare, LogOut, Settings, User as UserIcon,
} from "lucide-react"
import { Logo } from "@/components/brand/Logo"
import { NewsCard } from "@/components/market-pulse/NewsCard"
import { Skeleton } from "@/components/ui/skeleton"
import { useMarketPulse } from "@/lib/hooks/useMarketPulse"
import { useCriticalGapCount, usePromoLibrarySize } from "@/lib/hooks/useNavCounts"
import { useRecentDecisions } from "@/lib/hooks/useRecentDecisions"
import { cn } from "@/lib/utils"
import { formatPeriod } from "@/lib/format"

type NavItem = {
  href: "/" | "/promos" | "/ask"
  label: string
  icon: typeof Inbox
}

const NAV: NavItem[] = [
  { href: "/",       label: "Inbox",  icon: Inbox },
  { href: "/promos", label: "Promos", icon: Tag },
  { href: "/ask",    label: "Ask",    icon: MessageSquare },
]

const MODEL_VERSION = "v0.3.2"

// ──────────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userOpen, setUserOpen] = useState(false)

  function signOut() {
    document.cookie = "mp_session=; path=/; max-age=0; samesite=lax"
    router.push("/login")
    router.refresh()
  }

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/" || pathname.startsWith("/decision")
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  // Live counts that feed the nav badges
  const criticalCount = useCriticalGapCount()
  const promoCount = usePromoLibrarySize()

  // Recents (localStorage-backed)
  const recents = useRecentDecisions()

  // News (SWR, 5-min refresh; degrades silently when backend isn't up)
  const { articles, updatedAt, isLoading: newsLoading } = useMarketPulse()

  return (
    <aside className="hidden lg:flex sticky top-0 h-screen w-[304px] shrink-0 bg-neutral-200">
      {/* ── 64px rail: brand + workspace + user ─────────────────────── */}
      <div className="flex w-16 flex-col items-center justify-between py-2 shrink-0">
        <div className="flex flex-col items-center gap-3 p-2 pt-3">
          <Link
            href="/"
            className="block rounded-lg p-1.5 outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-black/50"
            title="Ramp — Inbox"
          >
            <Logo className="h-5 w-5 text-neutral-900" />
          </Link>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-[11px] font-semibold text-white"
            title="Damm UK"
          >
            D
          </div>
        </div>

        {/* User dropdown anchored to bottom of the rail */}
        <div className="relative pb-2">
          {userOpen && (
            <div className="absolute bottom-full left-12 mb-1 min-w-[180px] rounded-lg border border-neutral-200 bg-white p-1 shadow-md z-30">
              <div className="px-2.5 py-2 border-b border-neutral-100 mb-1">
                <div className="text-[12px] font-medium text-neutral-900 leading-tight">
                  Commercial Manager
                </div>
                <div className="text-[10.5px] text-neutral-500 leading-tight mt-0.5">
                  UK · Damm
                </div>
              </div>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                onClick={() => setUserOpen(false)}
              >
                <UserIcon className="h-4 w-4" />
                Account settings
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                onClick={() => setUserOpen(false)}
              >
                <Settings className="h-4 w-4" />
                Workspace
              </button>
              <div className="my-1 h-px bg-neutral-200" />
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                onClick={signOut}
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setUserOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-semibold text-neutral-700 transition-colors hover:bg-white"
            title="Commercial Manager · UK"
          >
            CM
          </button>
        </div>
      </div>

      {/* ── 240px areas card ─────────────────────────────────────────── */}
      <div className="flex-1 py-2 pr-2 min-w-0">
        <div className="h-full flex flex-col rounded-xl bg-neutral-100 min-w-0">
          {/* Top fixed region: heading + nav + recent */}
          <div className="p-3 pb-0">
            <div className="px-2 pt-1 pb-3">
              <h3 className="text-lg font-semibold tracking-tight text-neutral-900">
                Workflow
              </h3>
            </div>

            <nav className="flex flex-col gap-0.5">
              {NAV.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                  badge={
                    item.href === "/" ? criticalCount :
                    item.href === "/promos" ? promoCount :
                    null
                  }
                />
              ))}
            </nav>

            {recents.length > 0 && (
              <section className="mt-5">
                <SectionLabel>Recent</SectionLabel>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {recents.map((r) => (
                    <li key={`${r.sku}-${r.sub_channel}`}>
                      <RecentRow recent={r} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Market Pulse — flex-1, scrolls independently */}
          <section className="flex-1 min-h-0 flex flex-col mt-5 px-3">
            <div className="flex items-baseline justify-between px-2">
              <SectionLabel>Market Pulse</SectionLabel>
              {articles.length > 0 && (
                <span className="text-[9.5px] text-neutral-400 tabular-nums">
                  {articles.length}
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto mt-1 -mx-1 px-1">
              {newsLoading && articles.length === 0 ? (
                <div className="space-y-1 px-1 py-1">
                  <Skeleton className="h-12 w-full rounded-md" />
                  <Skeleton className="h-12 w-full rounded-md" />
                  <Skeleton className="h-12 w-full rounded-md" />
                </div>
              ) : articles.length === 0 ? (
                <NewsEmptyHint />
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {articles.slice(0, 20).map((a) => (
                    <li key={a.id}>
                      <NewsCard article={a} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Status footer */}
          <footer className="border-t border-neutral-200 px-5 py-3 text-[10.5px] leading-tight text-neutral-500 mt-2">
            <div className="flex items-center justify-between">
              <span>News</span>
              <span className="tabular-nums">{formatSyncedAgo(updatedAt)}</span>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span>Model</span>
              <span className="font-medium text-neutral-700 tabular-nums">{MODEL_VERSION}</span>
            </div>
          </footer>
        </div>
      </div>
    </aside>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────────────

function NavLink({
  item, active, badge,
}: {
  item: NavItem
  active: boolean
  badge: number | null
}) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-white text-neutral-900 shadow-xs"
          : "text-neutral-600 hover:bg-white/60 hover:text-neutral-900",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className="truncate flex-1">{item.label}</span>
      {badge !== null && badge > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-md px-1.5 min-w-[20px] h-[18px] text-[10.5px] font-medium tabular-nums",
            active
              ? "bg-neutral-100 text-neutral-700"
              : "bg-white/80 text-neutral-600 group-hover:bg-white",
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-medium tracking-wider uppercase text-neutral-500">
      {children}
    </div>
  )
}

function RecentRow({ recent }: { recent: ReturnType<typeof useRecentDecisions>[number] }) {
  const periodPart = recent.period ? `?period=${encodeURIComponent(recent.period)}` : ""
  const href =
    `/decision/${encodeURIComponent(recent.sku)}/${encodeURIComponent(recent.sub_channel)}${periodPart}`

  const skuDisplay = recent.sku_label ?? recent.sku
  const channelDisplay = shortenChannel(recent.channel_label ?? recent.sub_channel)
  const periodDisplay = recent.period ? formatPeriod(recent.period) : ""

  return (
    <Link
      href={href as Parameters<typeof Link>[0]["href"]}
      className="block rounded-md px-2 py-1.5 hover:bg-white/60 transition-colors min-w-0"
    >
      <div className="text-[12px] font-medium text-neutral-900 truncate">
        {skuDisplay}
      </div>
      <div className="text-[10.5px] text-neutral-500 truncate mt-0.5">
        {channelDisplay}{periodDisplay && ` · ${periodDisplay}`}
      </div>
    </Link>
  )
}

function NewsEmptyHint() {
  return (
    <div className="px-2 py-4 text-[11px] leading-snug text-neutral-500">
      No recent market events yet.
      <div className="text-[10px] text-neutral-400 mt-1">
        Run <code className="font-mono">make news</code> to populate.
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function formatSyncedAgo(iso: string | null): string {
  if (!iso) return "—"
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return "—"
  const m = Math.round(ms / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

function shortenChannel(label: string): string {
  const map: Record<string, string> = {
    "off-trade grocery":       "Grocery",
    "convenience & wholesale": "Convenience",
    "national on trade":       "On-trade",
    "free trade":              "Free trade",
    "free trade cmbc":         "Free trade",
    "mdd copacking":           "Copacking",
    "b2b distributor":         "B2B",
    "grocery":                 "Grocery",
  }
  const key = label.toLowerCase()
  return map[key] ?? label
}
