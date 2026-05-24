"use client"

import {
  Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  Legend, ReferenceLine,
} from "recharts"
import type { TooltipProps } from "recharts"
import { formatHl, formatPeriodShort } from "@/lib/format"

type SimulatorDatum = {
  period: string
  baseline: number
  simulated?: number | null
  target?: number | null
}

export function SimulatorChart({
  series,
  highlightedPeriods = [],
  simulatedTone = "positive",
}: {
  series: SimulatorDatum[]
  highlightedPeriods?: string[]
  simulatedTone?: "positive" | "negative" | "neutral"
}) {
  const data = series.map((d) => ({ ...d, period: formatPeriodShort(d.period), rawPeriod: d.period }))
  const highlighted = new Set(highlightedPeriods.map(formatPeriodShort))
  const simulatedColor =
    simulatedTone === "negative"
      ? "var(--negative)"
      : simulatedTone === "neutral"
        ? "var(--chart-1)"
        : "var(--positive)"
  const hasSimulation = data.some((d) => d.simulated != null)
  const hasTarget = data.some((d) => d.target != null)

  // Pad the Y domain ~20% above the visible range and ~10% below so the
  // line sits in the middle of the plot area instead of riding the top.
  // Include target values in the range so the dashed target line is
  // always in frame when present.
  const allValues = data.flatMap((d) => [
    d.baseline,
    ...(d.simulated != null ? [d.simulated as number] : []),
    ...(d.target != null ? [d.target as number] : []),
  ])
  const dataMin = allValues.length ? Math.min(...allValues) : 0
  const dataMax = allValues.length ? Math.max(...allValues) : 1
  const dataRange = Math.max(dataMax - dataMin, 1)
  const yMin = Math.max(0, dataMin - dataRange * 0.25)
  const yMax = dataMax + dataRange * 0.30

  return (
    <div className="w-full h-full min-h-[320px] min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <ComposedChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
            tickFormatter={(v) => formatHl(v)}
            width={56}
            domain={[yMin, yMax]}
          />
          <Tooltip
            cursor={{ stroke: "var(--neutral)", strokeDasharray: "2 3", strokeWidth: 1 }}
            content={<SimulatorTooltip />}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
            iconType="line"
          />
          {data.map((d) =>
            highlighted.has(d.period) ? (
              <ReferenceLine
                key={d.period}
                x={d.period}
                stroke="var(--positive)"
                strokeDasharray="2 3"
                label={{
                  value: "promo",
                  position: "insideTop",
                  fontSize: 10,
                  fill: "var(--positive)",
                }}
              />
            ) : null,
          )}
          <Line
            type="monotone" dataKey="baseline" stroke="var(--muted-foreground)"
            strokeWidth={1.5} dot={false} name="Current forecast"
          />
          {hasTarget && (
            <Line
              type="monotone" dataKey="target" stroke="var(--neutral)"
              strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Target"
              connectNulls
            />
          )}
          {hasSimulation && (
            <Line
              type="monotone" dataKey="simulated" stroke={simulatedColor}
              strokeWidth={2.5} dot={{ r: 2.5, fill: simulatedColor }} name="With this action"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

type TooltipDatum = SimulatorDatum & {
  rawPeriod?: string
}

function SimulatorTooltip({
  active,
  payload,
}: TooltipProps<number, string> & { payload?: Array<{ payload: TooltipDatum }> }) {
  if (!active || !payload?.length) return null
  const datum = payload[0]?.payload
  if (!datum) return null
  const hasSim = datum.simulated != null
  const delta = hasSim ? Number(datum.simulated) - Number(datum.baseline) : null

  return (
    <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-[12px] shadow-sm">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        {datum.rawPeriod ?? datum.period}
      </div>
      <div className="flex items-center justify-between gap-6 tabular-nums">
        <span className="text-neutral-500">Current forecast</span>
        <span className="font-medium text-neutral-900">{formatHl(Number(datum.baseline))}</span>
      </div>
      {datum.target != null && (
        <div className="flex items-center justify-between gap-6 tabular-nums">
          <span className="text-neutral-500">Target</span>
          <span className="text-neutral-700">{formatHl(Number(datum.target))}</span>
        </div>
      )}
      {hasSim && (
        <>
          <div className="flex items-center justify-between gap-6 tabular-nums">
            <span className="text-neutral-500">With this action</span>
            <span className="font-medium text-neutral-900">{formatHl(Number(datum.simulated))}</span>
          </div>
          {datum.target != null && (
            <div className="mt-1.5 border-t border-neutral-100 pt-1.5 tabular-nums">
              {Number(datum.simulated) >= Number(datum.target) ? (
                <span className="text-[var(--positive)]">Above target ✓</span>
              ) : (
                <span className="text-[var(--negative)]">
                  Still short by {formatHl(Number(datum.target) - Number(datum.simulated))}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
