/**
 * GET /api/user/entitlements — returns the current user's plan entitlements.
 *
 * Used by client components (export dialog, brand studio gate) to gate
 * paid-only features without exposing the full user record.
 *
 * Returns 401 for unauthenticated users. Unauthenticated callers should
 * receive free-tier entitlements by default (the caller handles that case).
 */

import { NextResponse } from "next/server";

import { unauthorized } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/session";
import { getEntitlements } from "@/lib/billing/entitlements";
import { getUserCreditState } from "@/lib/billing/credits";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return unauthorized();
  }

  // Derive the balance from getUserCreditState so the period-rollover reset is
  // applied here too; otherwise this endpoint reports a stale raw balance that
  // disagrees with the generate API until the next generation resets it.
  const creditState = await getUserCreditState(user.id);
  const entitlements = getEntitlements(creditState.plan);

  return NextResponse.json({
    plan: creditState.plan,
    creditBalance: creditState.balance,
    entitlements,
  });
}
