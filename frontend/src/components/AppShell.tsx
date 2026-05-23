/**
 * App shell — left sidebar nav + top breadcrumb bar + main content outlet.
 *
 * UX rationale:
 *   - Sidebar is the spine: every page is reachable in one click from
 *     anywhere. The icon + label + one-line hint makes destinations
 *     legible at a glance for first-time users.
 *   - The active page is marked with a Damm-red left border + filled bg
 *     so the user always knows where they are.
 *   - Topbar shows the current page title and a "Reset to hero" button
 *     for quick demo recovery.
 */

import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom"
import {
  LayoutDashboard, LineChart, Lightbulb, Tag, Sliders, Target, MessageCircle,
  Beer, ArrowRight, FileText,
} from "lucide-react"
import { useMeta } from "@/lib/hooks"
import { cn } from "@/lib/utils"

const NAV = [
  { to: "/",                label: "Overview",         hint: "Where's the gap?",         icon: LayoutDashboard },
  { to: "/forecast",        label: "Forecast",         hint: "What does the model predict?", icon: LineChart },
  { to: "/drivers",         label: "Drivers",          hint: "Why is the gap here?",     icon: Lightbulb },
  { to: "/promos",          label: "Promotions",       hint: "What's worked before?",    icon: Tag },
  { to: "/simulator",       label: "Simulator",        hint: "What if we change things?", icon: Sliders },
  { to: "/recommendations", label: "Recommendations",  hint: "What should we do?",       icon: Target },
  { to: "/chat",            label: "Ask MarketPulse",  hint: "Conversational deep-dive", icon: MessageCircle },
] as const

export function AppShell() {
  const { data: meta } = useMeta()
  const navigate = useNavigate()
  const location = useLocation()
  const currentNav = NAV.find(n =>
    n.to === "/" ? location.pathname === "/" : location.pathname.startsWith(n.to)
  )

  const goHero = () => {
    if (meta?.hero) {
      navigate(`/forecast?sku=${meta.hero.sku}&sub_channel=${encodeURIComponent(meta.hero.sub_channel)}`)
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* SIDEBAR */}
      <aside className="w-64 shrink-0 border-r border-border flex flex-col bg-card">
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Beer className="w-5 h-5 text-primary" />
            <div>
              <div className="text-base font-semibold tracking-tight leading-tight">MarketPulse UK</div>
              <div className="text-[11px] text-muted-foreground">Damm × Engineering Hub</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-2">
          {NAV.map(n => {
            const Icon = n.icon
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) => cn(
                  "block px-5 py-2.5 transition group border-l-2",
                  isActive
                    ? "bg-primary/10 border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/30"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{n.label}</div>
                    <div className="text-[11px] text-muted-foreground/80 group-hover:text-muted-foreground transition truncate">
                      {n.hint}
                    </div>
                  </div>
                </div>
              </NavLink>
            )
          })}
        </nav>

        <div className="px-3 py-3 border-t border-border space-y-1">
          {meta?.hero && (
            <button
              onClick={goHero}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent/30 transition"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span className="truncate">Jump to hero · <span className="text-primary">{meta.hero.brand}</span></span>
            </button>
          )}
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent/30 transition"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>API docs</span>
          </a>
          <a
            href="/diagnostics/parquet"
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent/30 transition"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Parquet diagnostics</span>
          </a>
        </div>
      </aside>

      {/* MAIN COLUMN */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* TOPBAR — current page context */}
        <header className="border-b border-border h-14 px-8 flex items-center justify-between bg-background/95 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-3">
            {currentNav && (
              <>
                <currentNav.icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{currentNav.label}</span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">{currentNav.hint}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {meta?.hero && (
              <button
                onClick={goHero}
                className="text-xs text-muted-foreground hover:text-foreground transition flex items-center gap-1.5"
              >
                Hero SKU
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
