"use client"

/**
 * Simulator — what-if promo planning. Client component (sliders + selects
 * need local state). One API call per "Simulate" press; result panel
 * updates in place so the controls stay visible.
 *
 * Layout:
 *   [ Controls (left, ~5/12) ]   [ Result chart + metrics (right, ~7/12) ]
 *
 * The result section is always rendered (skeleton state pre-simulate) so
 * the layout doesn't jump when results land.
 */

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { ArrowRight, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { SimulatorChart } from "@/components/charts/SimulatorChart"
import { api } from "@/lib/api"
import { formatGBP, formatHl, formatPercent, formatPeriodShort, gapColor } from "@/lib/format"
import type { components } from "@/lib/api.gen"

type ForecastSeries = components["schemas"]["ForecastSeries"]
type SimResult = components["schemas"]["SimulationResult"]

const PROMO_TYPES = ["multi-buy", "price-cut", "rollback", "clearance", "listing"] as const
type PromoType = (typeof PROMO_TYPES)[number]

const PROMO_LABEL: Record<PromoType, string> = {
  "multi-buy":  "Multi-buy (3 for £10 etc.)",
  "price-cut":  "Price cut",
  "rollback":   "Rollback",
  "clearance":  "Clearance",
  "listing":    "Listing push",
}

const fetcher = async (url: string): Promise<ForecastSeries> => {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json() as Promise<ForecastSeries>
}

export function SimulatePanel({ sku, sub_channel }: { sku: string; sub_channel: string }) {
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
      : 15

  const { data: forecast } = useSWR<ForecastSeries>(
    `/api/forecast?sku=${encodeURIComponent(sku)}&sub_channel=${encodeURIComponent(sub_channel)}`,
    fetcher,
  )

  const [discount, setDiscount] = useState(initialDiscount)
  const [promoType, setPromoType] = useState<PromoType>(prefillPromo)
  const [selectedMonths, setSelectedMonths] = useState<string[]>(prefillMonths)
  const [result, setResult] = useState<SimResult | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (forecast?.points && forecast.points.length > 0 && selectedMonths.length === 0) {
      setSelectedMonths([forecast.points![2]?.period ?? forecast.points![0].period])
    }
  }, [forecast, selectedMonths.length])

  async function handleRun() {
    if (!sku || !sub_channel || selectedMonths.length === 0) return
    setPending(true)
    setError(null)
    try {
      const { data, error: apiErr } = await api.POST("/api/simulate", {
        body: {
          sku,
          sub_channel,
          months: selectedMonths,
          discount_pct: discount,
          promo_type: promoType,
        },
      })
      if (apiErr) throw new Error(JSON.stringify(apiErr))
      setResult(data as SimResult)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed.")
    } finally {
      setPending(false)
    }
  }

  const baselineHl = result?.baseline.points?.reduce((s, p) => s + p.point, 0) ?? 0
  const simulatedHl = result?.simulated.points?.reduce((s, p) => s + p.point, 0) ?? 0

  const chartSeries = result
    ? (result.baseline.points ?? []).map((b, i) => ({
        period: b.period,
        baseline: b.point,
        simulated: (result.simulated.points ?? [])[i]?.point ?? b.point,
      }))
    : []

  const noPlayYet = result === null
  const gapClosedPct = result ? result.gap_closed_pct * 100 : 0
  const netPositive = (result?.net_gbp ?? 0) >= 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* ── Controls ───────────────────────────────────────────────────── */}
      <section className="lg:col-span-5 rounded-2xl border border-neutral-200 bg-white p-5 space-y-5">
        <header>
          <h3 className="text-[13px] font-semibold text-neutral-900">Configure the play</h3>
          <p className="text-[12px] text-neutral-500 mt-0.5">
            Pick the months, promo type, and discount. Hit Simulate to compare.
          </p>
        </header>

        <div>
          <div className="text-[10.5px] uppercase tracking-[0.16em] text-neutral-500 font-medium mb-2">
            Promo months
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(forecast?.points ?? []).map((p) => {
              const active = selectedMonths.includes(p.period)
              return (
                <button
                  key={p.period}
                  type="button"
                  onClick={() =>
                    setSelectedMonths((prev) =>
                      prev.includes(p.period)
                        ? prev.filter((m) => m !== p.period)
                        : [...prev, p.period],
                    )
                  }
                  className={`px-2 py-1.5 text-xs rounded-md border transition font-medium ${
                    active
                      ? "bg-neutral-900 text-white border-neutral-900"
                      : "border-neutral-200 text-neutral-500 hover:border-neutral-400 hover:text-neutral-900"
                  }`}
                >
                  {formatPeriodShort(p.period)}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10.5px] uppercase tracking-[0.16em] text-neutral-500 font-medium">
              Discount
            </span>
            <span className="text-[14px] font-semibold tabular-nums text-neutral-900">
              {discount}%
            </span>
          </div>
          <Slider
            value={[discount]}
            onValueChange={(v: number[]) => setDiscount(v[0])}
            min={0}
            max={40}
            step={1}
          />
          <div className="mt-1 flex justify-between text-[10.5px] text-neutral-400 tabular-nums">
            <span>0%</span>
            <span>40%</span>
          </div>
        </div>

        <div>
          <div className="text-[10.5px] uppercase tracking-[0.16em] text-neutral-500 font-medium mb-2">
            Promo type
          </div>
          <Select value={promoType} onValueChange={(v) => setPromoType(v as PromoType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROMO_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{PROMO_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleRun}
          disabled={selectedMonths.length === 0 || pending}
          className="w-full h-10 font-medium gap-2"
        >
          {pending ? "Simulating…" : (
            <>
              <TrendingUp className="h-4 w-4" />
              Simulate
            </>
          )}
        </Button>
        {error && (
          <p className="text-[11.5px] text-[color:var(--negative)]">{error}</p>
        )}
      </section>

      {/* ── Result ─────────────────────────────────────────────────────── */}
      <section className="lg:col-span-7 rounded-2xl border border-neutral-200 bg-white p-5 space-y-4">
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <h3 className="text-[13px] font-semibold text-neutral-900">Projected impact</h3>
            <p className="text-[12px] text-neutral-500 mt-0.5">
              {noPlayYet
                ? "Configure and simulate to see baseline vs lifted forecast."
                : result!.notes}
            </p>
          </div>
        </header>

        {noPlayYet ? (
          <EmptyState />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Metric
                label="Gap closed"
                value={
                  <span style={{ color: gapClosedPct > 0 ? "var(--positive)" : "var(--neutral)" }}>
                    {gapClosedPct > 0 ? "+" : ""}{gapClosedPct.toFixed(0)}%
                  </span>
                }
              />
              <Metric
                label="Volume lift"
                value={
                  <span style={{ color: result!.lift_hl > 0 ? "var(--positive)" : "var(--neutral)" }}>
                    {result!.lift_hl > 0 ? "+" : ""}{formatHl(result!.lift_hl)}
                  </span>
                }
                sub={`${(result!.applied_lift_pct * 100).toFixed(1)}% applied`}
              />
              <Metric
                label="Discount cost"
                value={result!.estimated_cost != null ? formatGBP(result!.estimated_cost) : "—"}
                sub="give-away"
              />
              <Metric
                label="Net £ impact"
                value={
                  result!.net_gbp != null ? (
                    <span style={{ color: netPositive ? "var(--positive)" : "var(--negative)" }}>
                      {netPositive ? "+" : ""}{formatGBP(result!.net_gbp)}
                    </span>
                  ) : "—"
                }
                sub={result!.net_gbp != null
                  ? netPositive ? "ROI-positive" : "subsidised"
                  : undefined}
              />
            </div>

            <SimulatorChart series={chartSeries} />

            <div className="text-[11.5px] text-neutral-500 grid grid-cols-2 gap-x-6 gap-y-1 pt-2 border-t border-neutral-100 tabular-nums">
              <span>
                Baseline volume:{" "}
                <span className="text-neutral-900 font-medium">{formatHl(baselineHl)}</span>
              </span>
              <span>
                Simulated volume:{" "}
                <span className="text-neutral-900 font-medium">{formatHl(simulatedHl)}</span>
              </span>
              <span>
                Gap before:{" "}
                <span
                  className="font-medium"
                  style={{ color: gapColor(result!.gap_before_hl >= 0 ? 1 : -1) }}
                >
                  {formatHl(result!.gap_before_hl)}
                </span>
              </span>
              <span>
                Gap after:{" "}
                <span
                  className="font-medium"
                  style={{ color: gapColor(result!.gap_after_hl >= 0 ? 1 : -1) }}
                >
                  {formatHl(result!.gap_after_hl)}
                </span>
              </span>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string
  value: React.ReactNode
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-neutral-200 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500 font-medium">
        {label}
      </div>
      <div className="mt-1 text-[18px] font-semibold tabular-nums tracking-tight leading-none">
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[10.5px] text-neutral-500 tabular-nums">{sub}</div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-neutral-200 px-5 py-10 text-center text-[13px] text-neutral-500">
      <div className="mx-auto mb-2 inline-flex items-center justify-center h-9 w-9 rounded-full bg-neutral-100">
        <ArrowRight className="h-4 w-4 text-neutral-400" />
      </div>
      <div className="font-medium text-neutral-700">No simulation yet</div>
      <div className="mt-1">Pick months and discount, then hit Simulate.</div>
    </div>
  )
}
