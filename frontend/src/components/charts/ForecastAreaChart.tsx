/**
 * ForecastAreaChart — Dub-style time-series with a confidence band.
 *
 * Two stacked layers on the same axes:
 *   - Pale red shaded band between p10/p90 (the 80% PI)
 *   - Damm-red line for the median forecast (p50)
 *   - Dashed neutral line for the target (prior-year same-month)
 *
 * Built on Recharts (same as Dub). Tooltip mirrors Dub's analytics
 * tooltip style: dark surface, tabular numbers, signed deltas.
 */

import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts"
import { formatHl, formatPeriodShort } from "@/lib/format"

type Point = {
  period: string
  point: number
  lo80: number
  hi80: number
  target?: number | null
  is_actual?: boolean
}

export function ForecastAreaChart({ points, height = 320 }: { points: Point[]; height?: number }) {
  if (!points.length) return <div className="text-sm text-muted-foreground">No data.</div>

  const data = points.map(p => ({
    period: p.period,
    p50: p.point,
    p10: p.lo80,
    p90: p.hi80,
    target: p.target ?? null,
    band: [p.lo80, p.hi80] as [number, number],
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fcBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dc2626" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#dc2626" stopOpacity={0.05} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="period"
          tick={{ fill: "#a1a1aa", fontSize: 11 }}
          tickLine={false} axisLine={{ stroke: "#27272a" }}
          tickFormatter={(v) => formatPeriodShort(v)}
        />
        <YAxis
          tick={{ fill: "#a1a1aa", fontSize: 11 }}
          tickLine={false} axisLine={false}
          tickFormatter={(v) => v >= 10_000 ? `${(v / 1000).toFixed(0)}k` : Math.round(v).toString()}
        />
        <Tooltip
          contentStyle={{
            background: "rgba(20,20,22,0.96)",
            border: "1px solid #27272a",
            borderRadius: 8,
            fontSize: 12,
            color: "#e4e4e7",
          }}
          labelStyle={{ color: "#a1a1aa", marginBottom: 4 }}
          formatter={(value: any, name: any) => {
            if (value === null || value === undefined) return ["—", String(name ?? "")]
            return [formatHl(value as number), String(name ?? "")]
          }}
          labelFormatter={(v) => formatPeriodShort(v as string)}
        />

        {/* 80% PI band — render the high line invisible then fill back to lo80 */}
        <Area
          dataKey="p90" stroke="none" fill="url(#fcBand)"
          isAnimationActive={false} name="80% PI upper"
        />
        <Area
          dataKey="p10" stroke="none" fill="#0a0a0a" fillOpacity={1}
          isAnimationActive={false} name="80% PI lower"
        />

        {/* Forecast median line */}
        <Line
          dataKey="p50" type="monotone"
          stroke="#dc2626" strokeWidth={2.5}
          dot={{ r: 3.5, fill: "#dc2626", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
          name="Forecast"
        />

        {/* Target dashed line */}
        <Line
          dataKey="target" type="monotone"
          stroke="#a3a3a3" strokeWidth={1.5} strokeDasharray="4 3"
          dot={false}
          isAnimationActive={false}
          name="Target"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
