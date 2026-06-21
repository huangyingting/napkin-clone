/**
 * Attribution visibility logic.
 *
 * Visibility rule: show the "Made with TextIQ" badge whenever the document
 * owner's plan does NOT include the `removeWatermark` capability (i.e. the
 * free tier).  Plus and Pro plans both carry `removeWatermark: true`, so the
 * badge is hidden for those owners — effectively a white-label perk.
 *
 * If the plan string is unrecognised (e.g. a future tier or a bad DB value),
 * we default to showing the badge (fail-open for attribution).
 */

import { PLAN_ENTITLEMENTS, type Plan } from "./entitlements";

/**
 * Pure function — no I/O, DOM-free — that decides whether the attribution
 * badge should be rendered for a given owner plan string.
 *
 * @param plan - The document owner's plan (e.g. "free", "plus", "pro").
 * @returns `true` when the badge should be shown, `false` to suppress it.
 */
export function shouldShowAttribution(plan: string): boolean {
  const entitlements = PLAN_ENTITLEMENTS[plan as Plan];
  // Unknown plan → show badge (fail-open).
  if (!entitlements) return true;
  return !entitlements.removeWatermark;
}
