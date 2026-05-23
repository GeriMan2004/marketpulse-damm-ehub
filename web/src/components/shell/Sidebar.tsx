"use client"

/**
 * Sidebar — two-column shape ported from Dub consumer's sidebar-nav.tsx.
 *
 * Source: apps/web/ui/layout/sidebar/sidebar-nav.tsx (the two-pane variant)
 *
 *   <aside w-[304px] bg-neutral-200>
 *     [64px rail]
 *       <Logo>                  (top — brand mark)
 *       <WorkspaceBadge>        (product switcher slot — single workspace
 *                                for Ramp, displayed as the workspace
 *                                avatar like Dub's groups column)
 *                ─ flex spacer ─
 *       <UserAvatar>            (bottom — clickable, opens sign-out menu)
 *     [240px areas card]
 *       <h3 "Workflow">
 *       <NavItem Inbox>
 *       <NavItem Promos>
 *       <NavItem Ask>
 *
 * Visual constants from Dub:
 *   SIDEBAR_WIDTH         = 304
 *   SIDEBAR_GROUPS_WIDTH  = 64
 *   SIDEBAR_AREAS_WIDTH   = 240
 * Areas card: rounded-xl bg-neutral-100, sits inside py-2 pr-2 outer pad
 * so the gray tray peeks around it.
 */

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { Inbox, Tag, MessageSquare, LogOut, Settings, User as UserIcon } from "lucide-react"
import { Logo } from "@/components/brand/Logo"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/" as const, label: "Inbox", icon: Inbox },
  { href: "/promos" as const, label: "Promos", icon: Tag },
  { href: "/ask" as const, label: "Ask", icon: MessageSquare },
] as const

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

          {/* Workspace badge — Dub renders a Vercel-style avatar here. Ramp
              has a single workspace, so this is a quiet identity chip. */}
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
      <div className="flex-1 py-2 pr-2">
        <div className="h-full flex flex-col rounded-xl bg-neutral-100 p-3">
          <div className="px-2 pt-1 pb-3">
            <h3 className="text-lg font-semibold tracking-tight text-neutral-900">
              Workflow
            </h3>
          </div>

          <nav className="flex flex-col gap-0.5">
            {NAV.map((item) => {
              const active = isActive(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-white text-neutral-900 shadow-xs"
                      : "text-neutral-600 hover:bg-white/60 hover:text-neutral-900",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="flex-1" />

          {/* Bottom hint — Dub uses this slot for usage / refer buttons.
              Quiet text reminding the persona this is a hackathon demo. */}
          <div className="px-2 pt-3 pb-1 text-[10.5px] leading-snug text-neutral-500">
            Damm × E-Hub Hackathon 2026 · Barcelona
          </div>
        </div>
      </div>
    </aside>
  )
}
