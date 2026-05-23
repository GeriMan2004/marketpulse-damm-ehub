"use client"

import {
  Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine, CartesianGrid,
} from "recharts"
import type { components } from "@/lib/api.gen"
import { formatHl } from "@/lib/format"
import { driverLabel } from "@/lib/driver-labels"

type Driver = components["schemas"]["Driver"]

export function DriversWaterfall({ drivers }: { drivers: Driver[] }) {
  const data = drivers.map((d) => {
    const label = driverLabel(d.feature)
    return {
      feature: label.length > 22 ? label.slice(0, 22) + "…" : label,
      value: d.shap_value,
      direction: d.direction,
    }
  })

  return (
    <div className="w-full h-[260px] min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
            tickFormatter={(v) => formatHl(v)}
          />
          <YAxis
            type="category" dataKey="feature"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
            width={160}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)" }}
            contentStyle={{
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 6, fontSize: 12,
            }}
            formatter={(value) => [formatHl(Number(value)), "Contribution"]}
          />
          <ReferenceLine x={0} stroke="var(--foreground)" strokeWidth={1} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.direction === "positive" ? "var(--positive)" : "var(--negative)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
