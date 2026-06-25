import "server-only";

import { createEntitlementFacade } from "@/lib/billing/entitlement-facade";
import { isUnlimitedCreditsEnabled } from "@/lib/billing/config";
import { getBillingState } from "@/lib/billing/service";
import { createTranslator, isLanguageSwitcherEnabled } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { isAppShellShortcutHelpEnabled } from "@/lib/shortcuts/features";

import { buildAppShellViewModel, type AppShellViewModel } from "./view-model";

export async function loadAppShellViewModel(): Promise<AppShellViewModel> {
  const [sessionUser, locale] = await Promise.all([
    getCurrentUser(),
    getLocale(),
  ]);
  const t = createTranslator(locale);
  const userId = sessionUser?.id;

  const account = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      })
    : null;

  const billingState = userId && account ? await getBillingState(userId) : null;
  const entitlementFacade = billingState
    ? createEntitlementFacade(billingState.plan)
    : null;

  return buildAppShellViewModel({
    account,
    billing:
      billingState && entitlementFacade
        ? {
            plan: entitlementFacade.plan,
            creditBalance: billingState.creditBalance,
            creditsPerPeriod: entitlementFacade.entitlements.creditsPerPeriod,
          }
        : null,
    languageSwitcherEnabled: isLanguageSwitcherEnabled(),
    keyboardShortcutsEnabled: isAppShellShortcutHelpEnabled(),
    unlimitedCredits: isUnlimitedCreditsEnabled(),
    t,
  });
}
