"use client"

/**
 * Step 3 — Simulate. Client Component.
 *
 * Impact workspace: baseline forecast is visible immediately, controls stay
 * compact, and running the scenario overlays the simulated line + KPI impact.
 */

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AlertTriangle, Play, Sliders, Sparkles } from "lucide-react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { SimulatorChart } from "@/components/charts/SimulatorChart"
import { formatHl, formatGBP, formatPeriodShort } from "@/lib/format"
import type { components } from "@/lib/api.gen"

type ForecastSeries = components["schemas"]["ForecastSeries"]
type ForecastPoint = components["schemas"]["ForecastPoint"]
type SimResult = components["schemas"]["SimulationResult"]

const PROMO_TYPES = ["multi-buy", "price-cut", "rollback", "clearance", "listing"] as const
type PromoType = (typeof PROMO_TYPES)[number]

const ACTION_TYPES = ["promo", "brand-focus", "channel-focus", "commercial-effort"] as const
type ActionType = (typeof ACTION_TYPES)[number]

const EFFORT_LEVELS = ["low", "medium", "high"] as const
type EffortLevel = (typeof EFFORT_LEVELS)[number]

const ACTION_META: Record<
  ActionType,
  { title: string; hint: string }
> = {
  "promo":             { title: "Trade promo",         hint: "Discount-driven lift on shelf. Highest impact, carries discount cost." },
  "brand-focus":       { title: "Brand push",          hint: "Marketing investment in the brand. Lifts pull-through, no discount cost." },
  "channel-focus":     { title: "Channel investment",  hint: "Extra effort inside this sub-channel (listings, fixture, activation)." },
  "commercial-effort": { title: "Commercial effort",   hint: "Sales-force push — order frequency, trade-up conversations." },
}

const fetcher = async (url: string): Promise<ForecastSeries> => {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json() as Promise<ForecastSeries>
}

export function SimulatePanel({
  sku,
  sub_channel,
  period,
}: {
  sku: string
  sub_channel: string
  period?: string
}) {
  const search = useSearchParams()
  const prefillMonths = (search.get("months") ?? "").split(",").filter(Boolean)
  const prefillPromoRaw = search.get("promo") ?? ""
  const prefillPromo = (PROMO_TYPES as readonly string[]).includes(prefillPromoRaw)
    ? (prefillPromoRaw as PromoType)
    : "multi-buy"
  const prefillDiscount = Number(search.get("discount") ?? "")
  const initialDiscount =
    Number.isFinite(prefillDiscount) && prefillDiscount > 0 && prefillDiscount <= 30
      ? prefillDiscount
      : 10
  // Action / effort prefills — needed so brand-focus / channel-focus /
  // commercial-effort plays from /api/plays land correctly (their default
  // action type is not "promo").
  const prefillActionRaw = search.get("action") ?? ""
  const prefillAction: ActionType = (ACTION_TYPES as readonly string[]).includes(prefillActionRaw)
    ? (prefillActionRaw as ActionType)
    : "promo"
  const prefillEffortRaw = search.get("effort") ?? ""
  const prefillEffort: EffortLevel = (EFFORT_LEVELS as readonly string[]).includes(prefillEffortRaw)
    ? (prefillEffortRaw as EffortLevel)
    : "medium"
  // True when the user arrived from a "Pick a play" recommendation card
  // (any prefill param present). Drives the recommendation banner + the
  // simplified default view.
  const fromRecommendation = prefillMonths.length > 0
    || search.get("promo") !== null
    || search.get("discount") !== null
    || search.get("action") !== null
    || search.get("effort") !== null

  const { data: forecast, error: forecastError } = useSWR<ForecastSeries>(
    `/api/forecast?sku=${encodeURIComponent(sku)}&sub_channel=${encodeURIComponent(sub_channel)}`,
    fetcher,
  )

  const [actionType, setActionType] = useState<ActionType>(prefillAction)
  const [effortLevel, setEffortLevel] = useState<EffortLevel>(prefillEffort)
  const [discount, setDiscount] = useState(initialDiscount)
  const [promoType, setPromoType] = useState<PromoType>(prefillPromo)
  const [selectedMonths, setSelectedMonths] = useState<string[]>(prefillMonths)
  const [result, setResult] = useState<SimResult | null>(null)
  const [pending, setPending] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  // Controls panel is hidden by default when the user arrived from a Pick-a-
  // play recommendation — the point of this view is to see the impact of
  // that play, not to re-author it. "Tweak" toggles the full editor.
  const [showTweak, setShowTweak] = useState(!fromRecommendation)

  const baselinePoints = useMemo(() => forecast?.points ?? [], [forecast?.points])
  const defaultMonth = useMemo(() => {
    if (!baselinePoints.length) return null
    return period && baselinePoints.some((p) => p.period === period)
      ? period
      : baselinePoints[0].period
  }, [baselinePoints, period])
  const activeMonths = selectedMonths.length > 0
    ? selectedMonths
    : defaultMonth
      ? [defaultMonth]
      : []
  const resultHasPoints = (result?.baseline.points?.length ?? 0) > 0
    && (result?.simulated.points?.length ?? 0) > 0
  const warning = result && !resultHasPoints ? result.notes : runError

  const chartSeries = useMemo(() => {
    if (resultHasPoints && result) {
      const simulatedByPeriod = new Map(
        (result.simulated.points ?? []).map((p) => [p.period, p.point]),
      )
      // targets_by_period is a new field on SimulationResult — only the
      // months the simulator was asked about have targets attached, so
      // we look up per-period and accept null for months outside scope.
      const targetByPeriod = (result.targets_by_period ?? {}) as Record<string, number>
      return baselinePoints.map((p) => ({
        period: p.period,
        baseline: p.point,
        simulated: simulatedByPeriod.get(p.period) ?? p.point,
        target: targetByPeriod[p.period] ?? null,
      }))
    }
    return baselinePoints.map((p) => ({
      period: p.period,
      baseline: p.point,
      simulated: null,
      target: null,
    }))
  }, [baselinePoints, result, resultHasPoints])

  // Per-month "above target" tally — drives the badge and notes line.
  // Counts ONLY months that have a target (i.e. the months the
  // simulator was asked about, which is the same as activeMonths).
  const targetCoverage = useMemo(() => {
    if (!result || !resultHasPoints) return null
    const targets = (result.targets_by_period ?? {}) as Record<string, number>
    const simulatedByPeriod = new Map(
      (result.simulated.points ?? []).map((p) => [p.period, p.point]),
    )
    let above = 0
    let total = 0
    let worstShortLabel: string | null = null
    let worstShortHl = 0
    for (const [period, target] of Object.entries(targets)) {
      total += 1
      const sim = simulatedByPeriod.get(period)
      if (sim != null && sim >= target) {
        above += 1
      } else if (sim != null) {
        const shortBy = target - sim
        if (shortBy > worstShortHl) {
          worstShortHl = shortBy
          worstShortLabel = period
        }
      }
    }
    return { above, total, worstShortLabel, worstShortHl }
  }, [result, resultHasPoints])

  const selectedBaseline = sumSelected(baselinePoints, activeMonths)
  const simulatedTotal = resultHasPoints
    ? (result?.simulated.points ?? []).reduce((s, p) => s + p.point, 0)
    : null
  const baselineTotal = resultHasPoints
    ? (result?.baseline.points ?? []).reduce((s, p) => s + p.point, 0)
    : selectedBaseline
  const liftedHl = simulatedTotal == null ? null : simulatedTotal - baselineTotal
  const gapClosedPct = resultHasPoints && result ? result.gap_closed_pct * 100 : null
  const simulatedTone =
    liftedHl == null ? "neutral" : liftedHl >= 0 ? "positive" : "negative"

  async function handleRun() {
    if (!sku || !sub_channel || activeMonths.length === 0) return
    setPending(true)
    setRunError(null)
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sku,
          sub_channel,
          months: activeMonths,
          action_type: actionType,
          // Promo-only fields — backend ignores them for other types.
          discount_pct: actionType === "promo" ? discount : 0,
          promo_type: promoType,
          // Effort-only field — backend ignores for promo.
          effort_level: effortLevel,
        }),
      })
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = await res.json()
      setResult(data as SimResult)
    } catch (err) {
      setResult(null)
      setRunError(err instanceof Error ? err.message : "Simulation failed.")
    } finally {
      setPending(false)
    }
  }

  const monthsText = activeMonths.length === 0
    ? "—"
    : activeMonths.length === 1
      ? formatPeriodShort(activeMonths[0])
      : `${activeMonths.length} months`
  const prefillSummary = actionType === "promo"
    ? `${promoLabel(promoType)} at ${discount}% · ${monthsText}`
    : `${ACTION_META[actionType].title} (${effortLevel}) · ${monthsText}`

  // Plain-English summary that replaces the backend's engineer-speak
  // `result.notes` string. Built from the same SimulationResult fields the
  // backend uses for the notes line, but framed for a Commercial Manager
  // reader: what we tried, what the model expects, and the caveats.
  const friendlyNotes = (() => {
    if (!result || !resultHasPoints) return null
    const what = actionType === "promo"
      ? `a ${discount}% ${promoLabel(promoType).toLowerCase()}`
      : `a ${effortLevel} ${ACTION_META[actionType].title.toLowerCase()}`
    const liftPct = (result.applied_lift_pct * 100).toFixed(1)
    const eventLine = result.event_boost_avg && result.event_boost_avg > 1.0
      ? ` Event boost of +${((result.event_boost_avg - 1) * 100).toFixed(0)}% applied (high-traffic months).`
      : ""
    // Surface per-month coverage honestly — same number the badge uses.
    let coverageLine = ""
    if (targetCoverage) {
      const { above, total, worstShortLabel, worstShortHl } = targetCoverage
      if (above === total) {
        coverageLine = ` All ${total} month${total === 1 ? "" : "s"} clear target.`
      } else if (above > 0) {
        coverageLine = ` ${above} of ${total} months clear target`
        if (worstShortLabel) {
          coverageLine += ` — worst remaining: ${worstShortLabel}, still short ${formatHl(worstShortHl)}.`
        } else {
          coverageLine += "."
        }
      } else {
        coverageLine = ` Action lifts the line but no month yet clears target — try a deeper discount or stack a brand push.`
      }
    }
    return `Running ${what} in ${monthsText} lifts volume by ${liftPct}% on top of the baseline forecast.${eventLine}${coverageLine}`
  })()

  // Two layouts:
  //  · Lean (prefilled, controls hidden): chart fills the row, prefill bar
  //    has a "Tweak" affordance. Use min-h-screen-minus-header so the chart
  //    actually fills the viewport instead of leaving dead space below.
  //  · Editor (free-form, or after "Tweak"): the two-column chart + rail.
  const showRail = showTweak

  return (
    <section className="flex flex-col gap-3 min-h-[calc(100vh-160px)]">
      {/* Compact prefill bar — single line summary + Run + Tweak toggle.
          Replaces the heavy black banner. The Tweak button is what lets
          the user fall back to the full editor when they want to deviate
          from the recommended play. */}
      {fromRecommendation && (
        <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[12.5px]">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
          <span className="text-neutral-500">Recommended play:</span>
          <span className="font-medium text-neutral-900 truncate">{prefillSummary}</span>
          <Button
            onClick={() => setShowTweak((v) => !v)}
            size="sm"
            variant="ghost"
            className="ml-auto h-7 shrink-0 gap-1.5 text-[11.5px] text-neutral-600 hover:text-neutral-900"
          >
            <Sliders className="h-3 w-3" />
            {showTweak ? "Hide controls" : "Tweak"}
          </Button>
          <Button
            onClick={handleRun}
            disabled={activeMonths.length === 0 || pending || !baselinePoints.length}
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1.5 text-[11.5px]"
          >
            <Play className="h-3 w-3" />
            {pending ? "Running…" : "Run"}
          </Button>
        </div>
      )}

      <div className={`flex-1 grid grid-cols-1 gap-3 ${showRail ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 flex flex-col">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-[13px] font-semibold text-neutral-900">
              Impact on the forecast
            </h3>
            {targetCoverage && (() => {
              // Per-month framing: directly maps to what the user sees
              // on the chart — "for how many months does the green line
              // end up above the dashed target line?". Much clearer
              // than the cumulative-£ formulation which hid uneven
              // per-month coverage behind a single average number.
              const { above, total } = targetCoverage
              const allClear = above === total
              return (
                <div
                  className={[
                    "rounded-full px-2.5 py-0.5 text-[11.5px] font-medium tabular-nums",
                    allClear
                      ? "bg-[var(--positive)]/10 text-[var(--positive)]"
                      : above === 0
                        ? "bg-[var(--negative)]/10 text-[var(--negative)]"
                        : "bg-neutral-100 text-neutral-700",
                  ].join(" ")}
                  title="Counts months where the simulated line ends up at or above the dashed target line."
                >
                  {allClear
                    ? "Above target every month"
                    : `Above target in ${above} of ${total} months`}
                </div>
              )
            })()}
          </div>

          {/* Inline KPI row — plain-English labels. Values stay blank until
              the simulation runs; the strip sits inside the chart card so
              empty state doesn't anchor the page with empty surfaces. */}
          <dl className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 border-y border-neutral-100 py-2 sm:grid-cols-4">
            <KpiInline
              label="Below target"
              value={resultHasPoints && result ? formatHl(Math.abs(result.gap_before_hl)) : "—"}
              tone={result?.gap_before_hl && result.gap_before_hl < 0 ? "negative" : "neutral"}
            />
            <KpiInline
              label="Extra volume"
              value={liftedHl == null ? "—" : `${liftedHl > 0 ? "+" : ""}${formatHl(liftedHl)}`}
              tone={liftedHl == null ? "neutral" : liftedHl >= 0 ? "positive" : "negative"}
            />
            <KpiInline
              label="Above target"
              value={
                targetCoverage
                  ? targetCoverage.total === 0
                    ? "—"
                    : `${targetCoverage.above} of ${targetCoverage.total} mo`
                  : "—"
              }
              tone={
                targetCoverage && targetCoverage.above === targetCoverage.total
                  ? "positive"
                  : "neutral"
              }
            />
            <KpiInline
              label="Discount cost"
              value={result?.estimated_cost ? formatGBP(result.estimated_cost) : "—"}
            />
          </dl>

          <div className="flex-1 min-h-[320px]">
            {forecastError ? (
              <Warning text="Could not load the current forecast." />
            ) : chartSeries.length > 0 ? (
              <SimulatorChart
                series={chartSeries}
                highlightedPeriods={activeMonths}
                simulatedTone={simulatedTone}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-neutral-500">
                Loading current forecast…
              </div>
            )}
          </div>

          {warning && <Warning text={warning} className="mt-3" />}
          {friendlyNotes && (
            <p className="mt-3 border-t border-neutral-100 pt-3 text-[12.5px] leading-relaxed text-neutral-600">
              {friendlyNotes}
            </p>
          )}
        </section>

        {showRail && (
        <aside className="rounded-2xl border border-neutral-200 bg-white p-4">
          <h3 className="text-[13px] font-semibold text-neutral-900">Scenario controls</h3>

          <div className="mt-4 space-y-4">
            {/* Action — drives which secondary controls show below.
                Hover for the per-action hint (kept as tooltip rather than
                a paragraph that lives below the chips). */}
            <div>
              <label className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-neutral-500">
                Action
              </label>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {ACTION_TYPES.map((t) => {
                  const active = actionType === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setResult(null)
                        setActionType(t)
                      }}
                      title={ACTION_META[t].hint}
                      className={[
                        "rounded-md border px-2 py-1.5 text-[11.5px] font-medium transition-colors text-left",
                        active
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900",
                      ].join(" ")}
                    >
                      {ACTION_META[t].title}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="flex items-baseline justify-between text-[10.5px] font-medium uppercase tracking-[0.14em] text-neutral-500">
                <span>Months</span>
                {activeMonths.length > 0 && (
                  <span className="font-normal tabular-nums text-neutral-400 normal-case tracking-normal">
                    {activeMonths.length} selected
                  </span>
                )}
              </label>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {baselinePoints.map((p) => {
                  const active = activeMonths.includes(p.period)
                  return (
                    <button
                      key={p.period}
                      type="button"
                      onClick={() => {
                        setResult(null)
                        setSelectedMonths((prev) =>
                          (prev.length > 0 ? prev : activeMonths).includes(p.period)
                            ? (prev.length > 0 ? prev : activeMonths).filter((m) => m !== p.period)
                            : [...(prev.length > 0 ? prev : activeMonths), p.period],
                        )
                      }}
                      className={[
                        "rounded-md border px-2 py-1.5 text-[12px] font-medium transition-colors",
                        active
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900",
                      ].join(" ")}
                    >
                      {formatPeriodShort(p.period)}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Promo-only controls: discount slider + promo type. */}
            {actionType === "promo" && (
              <>
                <div>
                  <label className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-neutral-500">
                    Discount <span className="font-semibold text-neutral-900">{discount}%</span>
                  </label>
                  <Slider
                    value={[discount]}
                    onValueChange={(v: number[]) => {
                      setResult(null)
                      setDiscount(v[0])
                    }}
                    min={0}
                    max={30}
                    step={1}
                    className="mt-3"
                  />
                </div>

                <div>
                  <label className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-neutral-500">
                    Promo type
                  </label>
                  <Select
                    value={promoType}
                    onValueChange={(v) => {
                      setResult(null)
                      setPromoType(v as PromoType)
                    }}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROMO_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{promoLabel(t)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Non-promo controls: effort level (low / medium / high). */}
            {actionType !== "promo" && (
              <div>
                <label className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-neutral-500">
                  Effort level
                </label>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {EFFORT_LEVELS.map((lvl) => {
                    const active = effortLevel === lvl
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => {
                          setResult(null)
                          setEffortLevel(lvl)
                        }}
                        className={[
                          "rounded-md border px-2 py-1.5 text-[12px] font-medium capitalize transition-colors",
                          active
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900",
                        ].join(" ")}
                      >
                        {lvl}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <Button
              onClick={handleRun}
              disabled={activeMonths.length === 0 || pending || !baselinePoints.length}
              className="w-full gap-2"
            >
              <Play className="h-3.5 w-3.5" />
              {pending ? "Simulating…" : "Run scenario"}
            </Button>
          </div>
        </aside>
        )}
      </div>
    </section>
  )
}

function KpiInline({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: React.ReactNode
  tone?: "positive" | "negative" | "neutral"
}) {
  const color =
    tone === "positive"
      ? "text-[var(--positive)]"
      : tone === "negative"
        ? "text-[var(--negative)]"
        : "text-neutral-900"
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-neutral-500">
        {label}
      </dt>
      <dd className={`mt-0.5 truncate text-[15px] font-semibold tabular-nums ${color}`}>
        {value}
      </dd>
    </div>
  )
}

function Warning({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 ${className}`}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  )
}

function sumSelected(points: ForecastPoint[], selectedMonths: string[]): number {
  const selected = new Set(selectedMonths)
  return points.reduce((sum, p) => sum + (selected.has(p.period) ? p.point : 0), 0)
}

function promoLabel(type: PromoType): string {
  return type
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ")
}
