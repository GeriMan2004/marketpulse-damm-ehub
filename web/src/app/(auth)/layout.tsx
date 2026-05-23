/**
 * Auth-only layout — centered card, no sidebar.
 * Mirrors Dub's sign-in screen: white background, vertically centered.
 */

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 flex items-center justify-center px-4">
        {children}
      </main>
      <footer className="py-4 text-center text-[11px] text-muted-foreground">
        MarketPulse UK · demo · {new Date().getFullYear()}
      </footer>
    </div>
  )
}
