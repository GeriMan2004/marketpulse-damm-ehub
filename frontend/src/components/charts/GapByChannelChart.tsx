/**
 * GapByChannelChart — Dub-style horizontal bar chart for sub-channel
 * forecast vs target. Built on Recharts.
 */

import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
  Cell,
} from "recharts"
import { formatHl, gapColor } from "@/lib/format"

type Row = { name: string; forecast: number; target: number; gap_pct: number }

export function GapByChannelChart({ rows, height = 240 }: { rows: Row[]; height?: number }) {
  if (!rows.length) return <div className="text-sm text-muted-foreground">No data.</div>

  const data = [...rows].sort((a, b) => b.forecast - a.forecast)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: "#a1a1aa", fontSize: 11 }}
          tickLine={false} axisLine={false}
          tickFormatter={(v) => v >= 10_000 ? `${(v / 1000).toFixed(0)}k` : Math.round(v).toString()}
        />
        <YAxis
          type="category" dataKey="name"
          tick={{ fill: "#e4e4e7", fontSize: 12 }}
          tickLine={false} axisLine={false}
          width={150}
        />
        <Tooltip
          contentStyle={{
            background: "rgba(20,20,22,0.96)",
            border: "1px solid #27272a",
            borderRadius: 8,
            fontSize: 12,
            color: "#e4e4e7",
          }}
          formatter={(value: any) => formatHl(value as number)}
        />
        <Bar dataKey="forecast" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={gapColor(d.gap_pct)} fillOpacity={0.9} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
