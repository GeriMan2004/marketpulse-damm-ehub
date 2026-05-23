import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border border-border text-muted-foreground",
        // Gap severity tiers — same names as GapTone in lib/format.ts
        critical: "bg-[color:var(--critical-soft)] text-[color:var(--critical)]",
        bad:      "bg-[color:var(--negative-soft)] text-[color:var(--negative)]",
        warn:     "bg-[color:var(--warn-soft)]     text-[color:var(--warn)]",
        good:     "bg-[color:var(--positive-soft)] text-[color:var(--positive)]",
        neutral:  "bg-[color:var(--neutral-soft)]  text-[color:var(--neutral)]",
        // Legacy aliases kept so existing callers don't break
        negative: "bg-[color:var(--negative-soft)] text-[color:var(--negative)]",
        positive: "bg-[color:var(--positive-soft)] text-[color:var(--positive)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
