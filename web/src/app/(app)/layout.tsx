/**
 * Authenticated app layout — Sidebar + Topbar + main content.
 *
 * Sits under the `(app)` route group so it doesn't wrap /login.
 * The auth gate lives in proxy.ts: any request without an mp_session
 * cookie gets bounced to /login before this layout ever renders.
 */

import { Sidebar } from "@/components/shell/Sidebar"
import { Topbar } from "@/components/shell/Topbar"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
