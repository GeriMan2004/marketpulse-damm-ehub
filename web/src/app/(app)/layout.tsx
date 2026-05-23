/**
 * Authenticated app shell — direct port of Dub consumer dashboard.
 *
 * Source: apps/web/app/app.dub.co/(dashboard)/layout.tsx
 *       + apps/web/ui/layout/main-nav.tsx
 *
 * Two-column card-on-tray frame:
 *   bg-neutral-200 tray
 *   ┌───────────────────┬───────────────────────────┐
 *   │  Sidebar (304px)  │  main content (white card)│
 *   └───────────────────┴───────────────────────────┘
 *
 * Market Pulse news lives INSIDE the Sidebar's areas card (see Sidebar.tsx),
 * not as a third column. Adding a third panel would crowd the main content
 * area, especially on the decision page where the forecast chart needs room.
 */

import { Sidebar } from "@/components/shell/Sidebar"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[min-content_minmax(0,1fr)] bg-neutral-200">
      <Sidebar />
      <div className="bg-neutral-200 lg:pb-2 lg:pr-2 lg:pt-2 h-screen">
        <div className="relative h-full overflow-y-auto bg-neutral-100 pt-px lg:rounded-xl lg:bg-white">
          {children}
        </div>
      </div>
    </div>
  )
}
