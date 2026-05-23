/**
 * App shell — left sidebar nav + topbar + main content outlet.
 *
 * UX rationale:
 *  - Sidebar persistent nav so the user always knows where they are
 *    in the decision flow (Gap → Why → Fix it).
 *  - Topbar shows the active filter context (brand × sub_channel × period)
 *    so users never lose track of what they're looking at.
 *  - Magic UI `BorderBeam` accent on the Overview link draws first attention
 *    to the "where's the gap?" question — the natural starting point.
 */

import { NavLink, Outlet, useNavigate } from "react-router-dom"
import { useMeta } from "@/lib/hooks"
import { cn } from "@/lib/utils"

const NAV = [
  { to: "/",                label: "Overview",         hint: "Where's the gap?" },
  { to: "/forecast",        label: "Forecast",         hint: "What does the model predict?" },
  { to: "/drivers",         label: "Drivers",          hint: "Why is the gap here?" },
  { to: "/promos",          label: "Promotions",       hint: "What's worked before?" },
  { to: "/simulator",       label: "Simulator",        hint: "What if we change things?" },
  { to: "/recommendations", label: "Recommendations",  hint: "What should we do?" },
  { to: "/chat",            label: "Ask MarketPulse",  hint: "Conversational deep-dive" },
]

export function AppShell() {
  const { data: meta } = useMeta()
  const navigate = useNavigate()

  const goHero = () => {
    if (meta?.hero) {
      navigate(`/forecast?sku=${meta.hero.sku}&sub_channel=${encodeURIComponent(meta.hero.sub_channel)}`)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* SIDEBAR */}
      <aside className="w-60 shrink-0 border-r border-border flex flex-col bg-card">
        <div className="px-5 py-5 border-b border-border">
          <div className="text-base font-semibold tracking-tight">MarketPulse UK</div>
          <div className="text-xs text-muted-foreground mt-1">Damm × Engineering Hub</div>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) => cn(
                "block px-5 py-2.5 text-sm transition group",
                isActive
                  ? "bg-primary/10 border-l-2 border-primary text-foreground"
                  : "border-l-2 border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/40"
              )}
            >
              <div className="font-medium">{n.label}</div>
              <div className="text-[11px] text-muted-foreground/70 group-hover:text-muted-foreground transition mt-0.5">
                {n.hint}
              </div>
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-border space-y-2">
          {meta?.hero && (
            <button onClick={goHero}
              className="w-full text-left text-xs text-muted-foreground hover:text-foreground transition">
              → demo hero · <span className="text-primary">{meta.hero.brand}</span>
            </button>
          )}
          <a href="http://localhost:8000/docs" target="_blank"
             className="block text-xs text-muted-foreground hover:text-foreground transition">
            /docs · OpenAPI
          </a>
          <a href="/diagnostics/parquet"
             className="block text-xs text-muted-foreground hover:text-foreground transition">
            Parquet diagnostics
          </a>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  )
}
