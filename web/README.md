# Ramp Web

Next.js frontend for the MarketPulse/Ramp Damm hackathon demo.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Recharts
- Radix/shadcn-style local primitives
- Lucide React
- SWR
- openapi-fetch + generated OpenAPI types

## Run

From repo root:

```bash
make web
```

Or from this folder:

```bash
pnpm install
pnpm dev
```

Open:

```text
http://localhost:3000
```

Backend is expected on:

```text
http://localhost:8000
```

## Important Files

| File/folder | Purpose |
|---|---|
| `src/app/(app)/page.tsx` | Main dashboard |
| `src/app/(app)/decision/[sku]/[channel]/` | Forecast decision flow |
| `src/app/(app)/promos/page.tsx` | Promotion ROI table |
| `src/app/(app)/brief/` | Customer brief flow |
| `src/components/charts/` | Forecast, simulator, quality, external charts |
| `src/components/inbox/` | Dashboard workflow components |
| `src/components/ui/` | Local UI primitives |
| `src/lib/api.ts` | API helper |
| `src/lib/api.gen.ts` | Generated OpenAPI types |

## Regenerate API Types

Run from repo root:

```bash
make types
```

Do not edit `src/lib/api.gen.ts` manually.

## Checks

```bash
pnpm exec tsc --noEmit
pnpm lint
```
