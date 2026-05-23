/**
 * FilterBar — shared topbar control across detail pages.
 *
 * Reads/writes (brand, sku, sub_channel) into the URL via useSearchParams
 * so deep-links and back-button work naturally.
 */

import { useSearchParams } from "react-router-dom"
import { useMeta } from "@/lib/hooks"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

export function FilterBar() {
  const { data: meta } = useMeta()
  const [params, setParams] = useSearchParams()

  const sku = params.get("sku")
  const sub_channel = params.get("sub_channel")

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value && value !== "__all__") next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4 mb-6">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">SKU</span>
        <Select value={sku ?? "__all__"} onValueChange={v => update("sku", v)}>
          <SelectTrigger className="w-[280px] h-9 text-sm">
            <SelectValue placeholder="Pick a SKU" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All SKUs</SelectItem>
            {meta?.skus.slice(0, 60).map(s => (
              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Sub-channel</span>
        <Select value={sub_channel ?? "__all__"} onValueChange={v => update("sub_channel", v)}>
          <SelectTrigger className="w-[220px] h-9 text-sm">
            <SelectValue placeholder="All channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All channels</SelectItem>
            {meta?.sub_channels_labeled.map(c => (
              <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
