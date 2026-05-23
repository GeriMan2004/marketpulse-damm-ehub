/**
 * SimulatorChart — baseline vs simulated forecast overlaid.
 */

import {
  CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { formatHl, formatPeriodShort } from "@/lib/format"

type Series = { period: string; baseline: number; simulated: number }

export function SimulatorChart({ series, height = 280 }: { series: Series[]; height?: number }) {
  if (!series.length) return null

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
            borderRadius: 8, fontSize: 12, color: "#e4e4e7",
          }}
          formatter={(v: any) => formatHl(v as number)}
          labelFormatter={(v) => formatPeriodShort(v as string)}
        />
        <Line
          dataKey="baseline" type="monotone"
          stroke="#a3a3a3" strokeWidth={1.5} strokeDasharray="4 3"
          dot={{ r: 3, fill: "#a3a3a3", strokeWidth: 0 }}
          isAnimationActive={false}
          name="Baseline"
        />
        <Line
          dataKey="simulated" type="monotone"
          stroke="#dc2626" strokeWidth={2.5}
          dot={{ r: 4, fill: "#dc2626", strokeWidth: 0 }}
          activeDot={{ r: 6 }}
          isAnimationActive={false}
          name="Simulated"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
