/**
 * Client-readable mirror of the server-only `AI_DECK_GEN_ENABLED` flag (#268).
 *
 * The server route (`POST /api/generate-deck`) is gated by
 * {@link isAiDeckGenEnabled} reading `AI_DECK_GEN_ENABLED` — a server-only var
 * that is NOT exposed to the client bundle. To gate the slide-editor AI entry
 * point in the browser we read a public mirror, `NEXT_PUBLIC_AI_DECK_GEN_ENABLED`.
 *
 * The reference to `process.env.NEXT_PUBLIC_AI_DECK_GEN_ENABLED` is intentionally
 * STATIC (not computed) so Next inlines its value into the client bundle at
 * build time — the same convention used for `NEXT_PUBLIC_APP_URL`
 * (see made-with-badge.tsx) and `NEXT_PUBLIC_COLLAB_WS_URL` (see ws-url.ts).
 *
 * This only hides the UI affordance; the server flag remains the security
 * boundary, and the open path always falls back to the deterministic derive
 * when generation is unavailable.
 */

import { parseBillingFlag } from "@/lib/billing/config";

/** Whether the client-side AI deck-generation entry point should be shown. */
export function isAiDeckGenClientEnabled(): boolean {
  return parseBillingFlag(process.env.NEXT_PUBLIC_AI_DECK_GEN_ENABLED);
}
