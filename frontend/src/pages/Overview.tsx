/**
 * Overview — the entry point. NOT a passive dashboard.
 *
 * The page is structured as a navigation hub that walks a commercial
 * director through the three questions the product answers, in order:
 *
 *   1. WHERE IS THE GAP?     hero banner with the single most-at-risk SKU
 *   2. WHAT'S BROKEN?         budget Sankey for the whole UK book
 *   3. WHAT DO I DO?          three big "next step" cards that link directly to
 *                              Forecast / Drivers / Recommendations / Simulator
 *
 * Then a supporting section with KPIs + problem-SKU list for users who
 * want raw numbers before they drill in.
 *
 * Why this structure beats "dashboard with charts":
 *   - Most teams build a passive dashboard. The user looks at it, says
 *     "OK", and closes the tab. We instead use every screen real-estate
 *     unit to push the user toward the action they should take next.
 *   - Every CTA links to a *parameterized* deep-link (e.g. drivers for
 *     the WORST SKU, not a generic page). The flow is curated.
 *   - The Sankey is interactive but we hand-hold: a short "click the red
 *     part" line above it so first-time users know they can drill.
 */

import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  AlertTriangle, ArrowRight, LineChart, Lightbulb, Target,
  Sliders, MessageCircle, TrendingDown, TrendingUp,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { NumberTicker } from "@/components/ui/number-ticker"
import { BorderBeam } from "@/components/ui/border-beam"
import { BudgetSankey } from "@/components/BudgetSankey"
import { useKpis, useGap, useExplainView, useMeta } from "@/lib/hooks"
import {
  formatHl, formatPercent, formatPeriodShort,
  gapBadgeVariant, gapLabel, gapColor,
} from "@/lib/format"

type Summary = { headline: string; bullets: string[]; suggested_next_action: string | null }

export default function Overview() {
  const { data: kpis, isLoading: kpisLoading } = useKpis()
  const { data: gap } = useGap(null, 5)
  const { data: meta } = useMeta()
  const navigate = useNavigate()
  const explainMut = useExplainView()
  const [summary, setSummary] = useState<Summary | null>(null)

  useEffect(() => {
    if (!kpis) return
    explainMut.mutate({
      page: "overview",
      filters: { period_range: kpis.period_range },
      visible_state: {
        total_forecast_hl: kpis.total_forecast_hl,
        total_target_hl: kpis.total_budget_hl,
        gap_hl: kpis.gap_hl,
        gap_pct: kpis.gap_pct,
        on_track_skus: kpis.on_track_skus,
        off_track_skus: kpis.off_track_skus,
      },
    }, { onSuccess: setSummary })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpis?.total_forecast_hl])

  if (kpisLoading || !kpis) {
    return (
      <div className="px-8 py-8 space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
        </div>
      </div>
    )
  }

  const worstGap = gap?.[0]
  const worstSku = worstGap ? meta?.skus.find(s => s.id === worstGap.sku) : null
  const isOverallBelow = kpis.gap_pct < 0

  return (
    <div className="px-8 py-8 max-w-7xl mx-auto space-y-8">

      {/* ────────────────────────────────────────────────────────────────
          HERO STRIP — the answer to "should I panic?" in one glance
          ──────────────────────────────────────────────────────────────── */}
      <section>
        <Card className="relative overflow-hidden">
          {Math.abs(kpis.gap_pct) > 0.05 && <BorderBeam size={200} duration={8} />}
          <CardContent className="py-6">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                {isOverallBelow ? (
                  <TrendingDown className="w-8 h-8 text-destructive" />
                ) : (
                  <TrendingUp className="w-8 h-8 text-green-500" />
                )}
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    UK forecast · {formatPeriodShort(kpis.period_range[0])} → {formatPeriodShort(kpis.period_range[1])}
                  </div>
                  <div className="text-2xl font-semibold mt-1">
                    {isOverallBelow ? "Below" : "Above"} target by{" "}
                    <span style={{ color: gapColor(kpis.gap_pct) }}>
                      <NumberTicker value={Math.abs(kpis.gap_pct * 100)} decimalPlaces={1} />%
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {kpis.off_track_skus} of {kpis.on_track_skus + kpis.off_track_skus} SKUs at risk ·
                    Aggregate {formatHl(kpis.total_forecast_hl)} vs {formatHl(kpis.total_budget_hl)} target
                  </div>
                </div>
              </div>

              <div className="flex-1" />

              {worstGap && (
                <div className="flex flex-col items-end gap-2 text-right">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Biggest single gap
                  </div>
                  <div className="text-sm font-medium">{worstSku?.label ?? worstGap.sku}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatPeriodShort(worstGap.period)} · {formatPercent(worstGap.gap_pct)}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => navigate(`/recommendations?sku=${worstGap.sku}&sub_channel=${encodeURIComponent(worstGap.sub_channel)}&period=${worstGap.period}`)}
                    className="mt-1"
                  >
                    See what to do <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          THE THREE QUESTIONS — explicit navigation hub
          ──────────────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Where to start
          </h2>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Pick the question you want answered. Each card drills into the data you need.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* CARD 1 — WHERE'S THE GAP? */}
          <Link
            to={worstGap
              ? `/forecast?sku=${worstGap.sku}&sub_channel=${encodeURIComponent(worstGap.sub_channel)}`
              : "/forecast"}
            className="group block"
          >
            <Card className="h-full transition hover:border-primary/50 hover:bg-accent/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <LineChart className="w-5 h-5 text-primary" />
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition" />
                </div>
                <CardTitle className="text-base mt-3">Where's the gap?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-semibold tabular-nums">
                  {kpis.off_track_skus} <span className="text-sm font-normal text-muted-foreground">SKU-months at risk</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  See the forecast curve, confidence interval, and target line for any SKU.
                </div>
                {worstGap && (
                  <div className="text-xs pt-2 border-t border-border/60 mt-3">
                    <span className="text-muted-foreground">Worst: </span>
                    <span className="font-medium">{worstSku?.label ?? worstGap.sku}</span>
                    <span className="ml-1" style={{ color: gapColor(worstGap.gap_pct) }}>
                      ({formatPercent(worstGap.gap_pct)})
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>

          {/* CARD 2 — WHY? */}
          <Link
            to={worstGap
              ? `/drivers?sku=${worstGap.sku}&sub_channel=${encodeURIComponent(worstGap.sub_channel)}`
              : "/drivers"}
            className="group block"
          >
            <Card className="h-full transition hover:border-primary/50 hover:bg-accent/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Lightbulb className="w-5 h-5 text-primary" />
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition" />
                </div>
                <CardTitle className="text-base mt-3">Why is the gap there?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm font-medium">
                  SHAP drivers · plain-English narrative
                </div>
                <div className="text-xs text-muted-foreground">
                  Decompose any forecast into the features that drove it.
                  Recent trend, weather, calendar, search demand — see what's pushing it up or down.
                </div>
                {worstGap && (
                  <div className="text-xs pt-2 border-t border-border/60 mt-3 text-muted-foreground">
                    Start with the biggest gap →
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>

          {/* CARD 3 — WHAT DO I DO? */}
          <Link
            to={worstGap
              ? `/recommendations?sku=${worstGap.sku}&sub_channel=${encodeURIComponent(worstGap.sub_channel)}&period=${worstGap.period}`
              : "/recommendations"}
            className="group block"
          >
            <Card className="h-full transition hover:border-primary/50 hover:bg-accent/20 relative overflow-hidden">
              <BorderBeam size={120} duration={7} />
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Target className="w-5 h-5 text-primary" />
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition" />
                </div>
                <CardTitle className="text-base mt-3">What should we do?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm font-medium">
                  3 scenarios · conservative / balanced / aggressive
                </div>
                <div className="text-xs text-muted-foreground">
                  LLM-generated actions grounded in historical promo ROI.
                  Each scenario shows expected gap closure, cost, and confidence.
                </div>
                <div className="text-xs pt-2 border-t border-border/60 mt-3 text-primary">
                  Recommended starting point →
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          BUDGET SANKEY — the hero visual
          ──────────────────────────────────────────────────────────────── */}
      <section>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Budget flow · UK forecast horizon</CardTitle>
              <Badge variant="outline" className="text-[10px]">Click any node to drill in</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              Width = forecast volume. Color = gap vs target (red = below, green = above).
              Hover for details.
            </div>
          </CardHeader>
          <CardContent>
            <BudgetSankey />
          </CardContent>
        </Card>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          LLM STORY OF THE QUARTER
          ──────────────────────────────────────────────────────────────── */}
      <section>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                {summary?.headline ?? "Generating story of the quarter…"}
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">LLM summary</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {!summary ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-4/6" />
              </div>
            ) : (
              <ul className="space-y-2 text-sm text-muted-foreground">
                {summary.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2"><span className="text-primary">·</span>{b}</li>
                ))}
                {summary.suggested_next_action && (
                  <li className="pt-2 text-foreground">
                    → <span className="font-medium">{summary.suggested_next_action}</span>
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          SUPPORTING DATA — KPIs + Problem SKU list
          ──────────────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Supporting numbers
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KpiTile label="Forecast" value={kpis.total_forecast_hl} suffix="Hl" />
          <KpiTile label="Target" value={kpis.total_budget_hl} suffix="Hl" muted />
          <Card>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Gap %
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="text-2xl font-semibold tabular-nums" style={{ color: gapColor(kpis.gap_pct) }}>
                {formatPercent(kpis.gap_pct)}
              </div>
              <Badge variant={gapBadgeVariant(kpis.gap_pct)} className="mt-1 text-[10px]">
                {gapLabel(kpis.gap_pct)}
              </Badge>
            </CardContent>
          </Card>
          <KpiTile label="SKUs at risk" value={kpis.off_track_skus} />
        </div>

        {/* PROBLEM SKU LIST */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Most-at-risk SKU-months</CardTitle>
              <span className="text-xs text-muted-foreground">Click any row to investigate</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!gap?.length ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                No gap data yet — run <code>make train</code>.
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {gap.slice(0, 5).map((g) => {
                  const sku = meta?.skus.find(s => s.id === g.sku)
                  const channel = meta?.sub_channels_labeled.find(c => c.code === g.sub_channel)
                  return (
                    <Link
                      key={`${g.sku}-${g.period}`}
                      to={`/forecast?sku=${g.sku}&sub_channel=${encodeURIComponent(g.sub_channel)}`}
                      className="flex items-center gap-4 px-5 py-3 hover:bg-accent/30 transition group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{sku?.label ?? g.sku}</div>
                        <div className="text-xs text-muted-foreground">
                          {channel?.label ?? g.sub_channel} · {formatPeriodShort(g.period)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums" style={{ color: gapColor(g.gap_pct) }}>
                          {formatPercent(g.gap_pct)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatHl(g.forecast_hl)} vs {formatHl(g.budget_hl)} target
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition shrink-0" />
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          QUICK ACTIONS — bottom row of CTAs for the impatient
          ──────────────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Or jump straight to…
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickAction to="/simulator" icon={Sliders} label="Run a scenario" hint="Drag a discount slider, see the gap shrink" />
          <QuickAction to="/promos" icon={Tag2} label="Promo ROI" hint="Which promo types pay back?" />
          <QuickAction to="/chat" icon={MessageCircle} label="Ask MarketPulse" hint='"Why is Estrella missing target?"' />
          <QuickAction to="/forecast" icon={LineChart} label="Browse all forecasts" hint="By SKU and sub-channel" />
        </div>
      </section>
    </div>
  )
}

function KpiTile({ label, value, suffix = "", muted = false }: {
  label: string; value: number; suffix?: string; muted?: boolean
}) {
  return (
    <Card className={muted ? "opacity-80" : ""}>
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="text-2xl font-semibold tabular-nums">
          <NumberTicker value={value} decimalPlaces={0} />
          {suffix && <span className="text-sm text-muted-foreground ml-1">{suffix}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

function QuickAction({ to, icon: Icon, label, hint }: {
  to: string; icon: any; label: string; hint: string
}) {
  return (
    <Link
      to={to}
      className="group block p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/20 transition"
    >
      <div className="flex items-start gap-3">
        <Icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium group-hover:text-primary transition">{label}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</div>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition shrink-0" />
      </div>
    </Link>
  )
}

// Local re-import to keep tree-shake friendly
import { Tag as Tag2 } from "lucide-react"
