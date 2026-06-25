import { PLAN_NAMES, type Plan } from "@/lib/billing/catalog";

import { resolveShellNavItems, type ShellNavItem } from "./navigation";

interface AccountShape {
  name: string | null;
  email: string;
}

interface BillingShape {
  plan: Plan;
  creditBalance: number;
  creditsPerPeriod: number;
}

type NavTranslator = Parameters<typeof resolveShellNavItems>[1];

export interface ShellDisplayIdentity {
  name: string | null;
  email: string;
  displayName: string;
  avatarInitial: string;
}

export interface ShellPlanCreditSummary {
  plan: Plan;
  planLabel: string;
  balance: number;
  creditsPerPeriod: number;
  unlimited: boolean;
  countLabel: string;
  title: string;
  href: string;
}

export interface ShellEnabledUtilities {
  languageSwitcher: boolean;
  keyboardShortcuts: boolean;
  credits: boolean;
  userMenu: boolean;
}

export interface AppShellViewModel {
  brandLabel: string;
  auth: {
    isAuthenticated: boolean;
  };
  displayIdentity: ShellDisplayIdentity | null;
  planCreditSummary: ShellPlanCreditSummary | null;
  navItems: ShellNavItem[];
  enabledUtilities: ShellEnabledUtilities;
}

export function buildShellDisplayIdentity(
  account: AccountShape,
): ShellDisplayIdentity {
  const trimmedName = account.name?.trim() ?? "";
  const displayName = trimmedName || account.email;
  return {
    name: account.name,
    email: account.email,
    displayName,
    avatarInitial: displayName.charAt(0).toUpperCase() || "?",
  };
}

export function buildShellPlanCreditSummary({
  billing,
  unlimitedCredits,
}: {
  billing: BillingShape;
  unlimitedCredits: boolean;
}): ShellPlanCreditSummary {
  const countLabel = unlimitedCredits
    ? "Unlimited"
    : billing.creditBalance.toLocaleString();
  const title = unlimitedCredits
    ? "Unlimited credits"
    : `${billing.creditBalance} / ${billing.creditsPerPeriod} credits remaining`;

  return {
    plan: billing.plan,
    planLabel: PLAN_NAMES[billing.plan],
    balance: billing.creditBalance,
    creditsPerPeriod: billing.creditsPerPeriod,
    unlimited: unlimitedCredits,
    countLabel,
    title,
    href: "/app/settings/billing",
  };
}

export function buildAppShellViewModel({
  account,
  billing,
  languageSwitcherEnabled,
  keyboardShortcutsEnabled,
  unlimitedCredits,
  t,
}: {
  account: AccountShape | null;
  billing: BillingShape | null;
  languageSwitcherEnabled: boolean;
  keyboardShortcutsEnabled: boolean;
  unlimitedCredits: boolean;
  t: NavTranslator;
}): AppShellViewModel {
  const isAuthenticated = account !== null;
  const planCreditSummary =
    isAuthenticated && billing
      ? buildShellPlanCreditSummary({ billing, unlimitedCredits })
      : null;

  return {
    brandLabel: t("header.brand"),
    auth: { isAuthenticated },
    displayIdentity: account ? buildShellDisplayIdentity(account) : null,
    planCreditSummary,
    navItems: resolveShellNavItems(isAuthenticated, t),
    enabledUtilities: {
      languageSwitcher: languageSwitcherEnabled,
      keyboardShortcuts: isAuthenticated && keyboardShortcutsEnabled,
      credits: isAuthenticated && planCreditSummary !== null,
      userMenu: isAuthenticated,
    },
  };
}
