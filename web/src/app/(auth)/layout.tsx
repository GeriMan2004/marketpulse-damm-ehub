/**
 * Auth layout — 2-column split.
 *
 * Left column: the form (Dub's grow-basis-0 vertical sandwich).
 * Right column: marketing panel with hackathon context + sponsor strip.
 *
 * Pattern reference: Linear / Vercel / Notion (NOT Dub — Dub's consumer
 * login is single-column; this two-pane is what was requested for Ramp
 * given the hackathon context).
 *
 * Sponsor logos are read from web/public/sponsors/. See the README there.
 * Until real SVGs are dropped in, the strip renders text wordmarks so the
 * layout doesn't look broken.
 */

import Link from "next/link"
import Image from "next/image"

// Drop logo files into web/public/sponsors/ and add an entry here.
// `logo` is optional — when absent, the wordmark renders as text.
type Sponsor = { name: string; logo?: string; href?: string }

const SPONSORS: Sponsor[] = [
  { name: "Damm" },
  { name: "Engineering Hub" },
  { name: "Anthropic" },
  { name: "Hugging Face" },
]

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-2 bg-white">
      {/* LEFT — form column (Dub's vertical sandwich) */}
      <div className="flex min-h-[100dvh] w-full flex-col items-center justify-between bg-white">
        <div className="grow basis-0">
          <div className="h-16 lg:h-24" />
        </div>

        <div className="relative flex w-full flex-col items-center justify-center px-4">
          {children}
        </div>

        <div className="flex grow basis-0 flex-col justify-end">
          <p className="px-10 py-8 text-center text-xs font-medium text-neutral-500 md:px-0">
            By continuing, you agree to the{" "}
            <Link href="#" className="font-semibold text-neutral-600 hover:text-neutral-800">
              demo terms
            </Link>
            . Any button signs you in — this is a hackathon walkthrough.
          </p>
        </div>
      </div>

      {/* RIGHT — marketing panel (hidden on mobile) */}
      <div className="hidden lg:flex relative flex-col justify-between bg-neutral-50 border-l border-neutral-200 overflow-hidden">
        {/* Subtle dot grid background */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgb(212 212 216) 1px, transparent 0)",
            backgroundSize: "20px 20px",
          }}
        />

        {/* Top eyebrow */}
        <div className="relative px-12 pt-12">
          <div className="text-[11px] uppercase tracking-[0.14em] text-neutral-500 font-medium">
            Built for
          </div>
          <div className="mt-2 text-[28px] leading-tight font-semibold tracking-tight text-neutral-900">
            Damm × Engineering Hub
            <br />
            <span className="text-neutral-400">Hackathon 2026</span>
          </div>
          <div className="mt-3 text-sm text-neutral-500">
            Barcelona · 23–24 May 2026
          </div>
        </div>

        {/* Middle quote / value prop */}
        <div className="relative px-12">
          <blockquote className="text-lg leading-snug text-neutral-700 font-medium max-w-md">
            &ldquo;Forecast the UK book, explain the gap, recommend the play.
            One inbox — every morning.&rdquo;
          </blockquote>
          <div className="mt-3 text-[12px] text-neutral-500">
            — Ramp, in one sentence
          </div>
        </div>

        {/* Bottom sponsor strip */}
        <div className="relative px-12 pb-12">
          <div className="text-[11px] uppercase tracking-[0.14em] text-neutral-500 font-medium mb-4">
            Partners & sponsors
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            {SPONSORS.map((s) => (
              <SponsorMark key={s.name} sponsor={s} />
            ))}
          </div>
          <p className="mt-6 text-[10.5px] text-neutral-400 max-w-md leading-relaxed">
            Drop sponsor logos as SVG into <code className="font-mono">web/public/sponsors/</code>
            {" "}and reference them from <code className="font-mono">(auth)/layout.tsx</code>.
          </p>
        </div>
      </div>
    </div>
  )
}

function SponsorMark({ sponsor }: { sponsor: Sponsor }) {
  if (sponsor.logo) {
    return (
      <Image
        src={`/sponsors/${sponsor.logo}`}
        alt={sponsor.name}
        width={120}
        height={28}
        className="h-7 w-auto opacity-70 grayscale hover:grayscale-0 hover:opacity-100 transition"
      />
    )
  }
  // Text wordmark fallback — until real logos are dropped in
  return (
    <span className="text-[13px] font-semibold tracking-tight text-neutral-500">
      {sponsor.name}
    </span>
  )
}
