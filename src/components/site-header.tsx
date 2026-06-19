import Link from "next/link";

import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { UserMenu } from "@/components/user-menu";
import { createTranslator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getEntitlements } from "@/lib/billing/entitlements";

export async function SiteHeader() {
  const sessionUser = await getCurrentUser();
  const locale = await getLocale();
  const t = createTranslator(locale);

  const account = sessionUser
    ? await prisma.user.findUnique({
        where: { id: sessionUser.id },
        select: { name: true, email: true, plan: true, creditBalance: true },
      })
    : null;

  const entitlements = account ? getEntitlements(account.plan) : null;
  const creditBalance = account?.creditBalance ?? 0;
  const creditsPerPeriod = entitlements?.creditsPerPeriod ?? 0;

  return (
    <header className="flex w-full items-center justify-between border-b border-ghost-border bg-ghost-bg/80 px-6 py-3 backdrop-blur">
      <Link
        href="/"
        className="text-base font-semibold tracking-tight text-ghost-text"
      >
        {t("header.brand")}
      </Link>

      <nav className="flex items-center gap-3">
        {account ? (
          <>
            <Link
              href="/app"
              className="flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-ghost-secondary transition hover:bg-ghost-wash hover:text-ghost-text"
            >
              {t("header.nav.documents")}
            </Link>
            <Link
              href="/app/workspaces"
              className="flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-ghost-secondary transition hover:bg-ghost-wash hover:text-ghost-text"
            >
              {t("header.nav.workspaces")}
            </Link>
            <Link
              href="/app/brands"
              className="flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-ghost-secondary transition hover:bg-ghost-wash hover:text-ghost-text"
            >
              {t("header.nav.brands")}
            </Link>

            {/* Credit usage indicator */}
            <Link
              href="/app/settings/billing"
              title={`${creditBalance} / ${creditsPerPeriod} credits remaining`}
              className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-ghost-secondary transition hover:bg-ghost-wash hover:text-ghost-text"
            >
              <span className="tabular-nums">
                {creditBalance.toLocaleString()}
              </span>
              <span className="text-ghost-secondary/60">credits</span>
            </Link>

            <KeyboardShortcuts />
            <LanguageSwitcher />
            <UserMenu name={account.name} email={account.email}>
              <Link
                href="/app/settings/billing"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-ghost-secondary transition hover:bg-ghost-wash hover:text-ghost-text"
              >
                Billing &amp; Plan
              </Link>
              <SignOutButton
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-ghost-secondary transition hover:bg-ghost-wash hover:text-ghost-text"
              />
            </UserMenu>
          </>
        ) : (
          <>
            <LanguageSwitcher />
            <Link
              href="/login"
              className="flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-ghost-secondary transition hover:bg-ghost-wash hover:text-ghost-text"
            >
              {t("header.nav.login")}
            </Link>
            <Link
              href="/signup"
              className="flex h-9 items-center justify-center rounded-full bg-ghost-accent px-4 text-sm font-medium text-white transition hover:opacity-90"
            >
              {t("header.nav.signup")}
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
