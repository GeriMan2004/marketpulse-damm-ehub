/**
 * DriversWaterfall — SHAP-style horizontal bar chart, positive/negative
 * colored, sorted by magnitude.
 */

import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts"

type Driver = { feature: string; shap_value: number; direction: "positive" | "negative" }

export function DriversWaterfall({ drivers, height = 300 }: { drivers: Driver[]; height?: number }) {
  if (!drivers.length) return <div className="text-sm text-muted-foreground">No drivers.</div>

  const data = [...drivers].sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value))

  return (
    <ResponsiveContainer width="100%" height={Math.max(height, drivers.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 6, right: 30, left: 0, bottom: 12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: "#a1a1aa", fontSize: 11 }}
          tickLine={false} axisLine={false}
          tickFormatter={(v) => `${v > 0 ? "+" : ""}${Math.round(v)}`}
        />
        <YAxis
          type="category" dataKey="feature"
          tick={{ fill: "#e4e4e7", fontSize: 12 }}
          tickLine={false} axisLine={false}
          width={170}
        />
        <ReferenceLine x={0} stroke="#525252" />
        <Tooltip
          contentStyle={{
            background: "rgba(20,20,22,0.96)",
            border: "1px solid #27272a",
            borderRadius: 8,
            fontSize: 12,
            color: "#e4e4e7",
          }}
          formatter={(v: any) => `${v > 0 ? "+" : ""}${Math.round(v as number)} Hl`}
        />
        <Bar dataKey="shap_value" radius={3} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.shap_value > 0 ? "#16a34a" : "#dc2626"} fillOpacity={0.88} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
