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

import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getEntitlements } from "@/lib/billing/entitlements";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { plan: true, creditBalance: true, creditPeriodStart: true },
  });

  const plan = dbUser?.plan ?? "free";
  const entitlements = getEntitlements(plan);

  return NextResponse.json({
    plan,
    creditBalance: dbUser?.creditBalance ?? 0,
    entitlements,
  });
}
