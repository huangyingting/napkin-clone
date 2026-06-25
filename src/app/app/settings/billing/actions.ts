/**
 * Billing server actions — plan management for the billing settings page.
 *
 * These actions call the active BillingProvider (mock in dev/CI, Stripe when
 * STRIPE_SECRET_KEY is set) and revalidate the settings page on success.
 */
"use server";

import { revalidatePath } from "next/cache";

import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/session";
import { getBillingProvider } from "@/lib/billing/provider";
import { isPlan, type Plan } from "@/lib/billing/catalog";
import type { BillingActionData } from "@/lib/billing/action-types";

/** Change the current user's plan (upgrade or downgrade). */
export async function changePlanAction(
  targetPlan: string,
): Promise<ActionResult<BillingActionData>> {
  const user = await requireUser();

  if (!isPlan(targetPlan)) {
    return actionError(`Invalid plan: ${targetPlan}.`);
  }

  const provider = await getBillingProvider();
  const result = await provider.changePlan(user.id, targetPlan as Plan);

  if (!result.success) {
    return actionError(result.message);
  }

  revalidatePath("/app/settings/billing");
  revalidatePath("/app/settings");

  return actionOk({ message: result.message, redirectUrl: result.redirectUrl });
}

/** Cancel the current user's subscription. */
export async function cancelSubscriptionAction(): Promise<
  ActionResult<BillingActionData>
> {
  const user = await requireUser();

  const provider = await getBillingProvider();
  const result = await provider.cancelSubscription(user.id);

  if (!result.success) {
    return actionError(result.message);
  }

  revalidatePath("/app/settings/billing");
  revalidatePath("/app/settings");

  return actionOk({ message: result.message });
}
