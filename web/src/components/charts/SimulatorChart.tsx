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

  return (
    <div className="w-full h-[360px] min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
            tickFormatter={(v) => formatHl(v)}
            width={56}
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
            strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Baseline"
          />
          {hasSimulation && (
            <Line
              type="monotone" dataKey="simulated" stroke={simulatedColor}
              strokeWidth={2.5} dot={{ r: 2.5, fill: simulatedColor }} name="Simulated"
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
        <span className="text-neutral-500">Baseline</span>
        <span className="font-medium text-neutral-900">{formatHl(Number(datum.baseline))}</span>
      </div>
      {hasSim && (
        <>
          <div className="flex items-center justify-between gap-6 tabular-nums">
            <span className="text-neutral-500">Simulated</span>
            <span className="font-medium text-neutral-900">{formatHl(Number(datum.simulated))}</span>
          </div>
          <div className="mt-1.5 border-t border-neutral-100 pt-1.5 tabular-nums">
            <span className={delta && delta >= 0 ? "text-[var(--positive)]" : "text-[var(--negative)]"}>
              {delta && delta > 0 ? "+" : ""}{formatHl(delta ?? 0)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
