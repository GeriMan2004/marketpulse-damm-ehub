/**
 * Auth gate — Next 16 `proxy.ts` (formerly middleware.ts).
 *
 * Single rule: if there's no `mp_session` cookie, bounce to /login with
 * the originally requested path in `?next=` so we can return them there
 * after fake-signing-in.
 *
 * Public paths (no auth):
 *   /login           — the login screen itself
 *   /api/*           — the dev-mode rewrite to FastAPI; auth happens server-side
 *   /_next/*         — Next.js internals (already excluded by matcher)
 *   /favicon.ico     — already excluded by matcher
 *
 * This is a hackathon-grade gate. Real auth (NextAuth / Clerk / Supabase)
 * would replace this whole file. The rest of the app trusts the cookie's
 * presence; only this gate cares about its value.
 */

import { NextResponse, type NextRequest } from "next/server"

const SESSION_COOKIE = "mp_session"

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Public routes — let through
  if (pathname.startsWith("/login")) return NextResponse.next()
  if (pathname.startsWith("/api/")) return NextResponse.next()

  // Gate everything else
  const session = req.cookies.get(SESSION_COOKIE)?.value
  if (!session) {
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", pathname + req.nextUrl.search)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  // Run on every path except Next internals, static assets, and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
