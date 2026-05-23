/**
 * Typed API client.
 *
 * Types are generated from FastAPI's OpenAPI by `make types` (root Makefile).
 * Re-run after any backend schema change.
 */
import createClient from "openapi-fetch"
import type { paths } from "./api.gen"

export const api = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL ?? "/api",
})

// Snapshot mode: `⌘+.` toggles to read from public/snapshots/*.json instead
let snapshotMode = false
export function isSnapshotMode() { return snapshotMode }
export function toggleSnapshotMode() {
  snapshotMode = !snapshotMode
  return snapshotMode
}
