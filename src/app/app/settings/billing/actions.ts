/**
 * Billing server actions — plan management for the billing settings page.
 *
 * These actions call the active BillingProvider (mock in dev/CI, Stripe when
 * STRIPE_SECRET_KEY is set) and revalidate the settings page on success.
 */
"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/session";
import { getBillingProvider } from "@/lib/billing/provider";
import { isPlan, type Plan } from "@/lib/billing/entitlements";

export interface BillingActionResult {
  success: boolean;
  message: string;
  redirectUrl?: string;
}

/** Change the current user's plan (upgrade or downgrade). */
export async function changePlanAction(
  targetPlan: string,
): Promise<BillingActionResult> {
  const user = await requireUser();

  if (!isPlan(targetPlan)) {
    return { success: false, message: `Invalid plan: ${targetPlan}.` };
  }

  const provider = await getBillingProvider();
  const result = await provider.changePlan(user.id, targetPlan as Plan);

  if (result.success) {
    revalidatePath("/app/settings/billing");
    revalidatePath("/app/settings");
  }

  return {
    success: result.success,
    message: result.message,
    redirectUrl: result.redirectUrl,
  };
}

/** Cancel the current user's subscription. */
export async function cancelSubscriptionAction(): Promise<BillingActionResult> {
  const user = await requireUser();

  const provider = await getBillingProvider();
  const result = await provider.cancelSubscription(user.id);

  if (result.success) {
    revalidatePath("/app/settings/billing");
    revalidatePath("/app/settings");
  }

  return { success: result.success, message: result.message };
}
