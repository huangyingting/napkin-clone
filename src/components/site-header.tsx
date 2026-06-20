import Link from "next/link";

import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  MobileNavMenu,
  MobileNavNonClosing,
} from "@/components/mobile-nav-menu";
import { SignOutButton } from "@/components/sign-out-button";
import { UserMenu } from "@/components/user-menu";
import { createTranslator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getEntitlements, UNLIMITED_CREDITS } from "@/lib/billing/entitlements";

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
  const creditCount = UNLIMITED_CREDITS
    ? "Unlimited"
    : creditBalance.toLocaleString();
  const creditTitle = UNLIMITED_CREDITS
    ? "Unlimited credits"
    : `${creditBalance} / ${creditsPerPeriod} credits remaining`;

  return (
    <header className="relative z-header flex w-full items-center justify-between overflow-x-clip border-b border-ds-border-strong bg-ds-surface-base/80 px-4 py-3 backdrop-blur sm:px-6">
      <Link
        href="/"
        className="shrink-0 text-base font-semibold tracking-tight text-ds-text-primary"
      >
        {t("header.brand")}
      </Link>

      {/* ── Desktop nav (md+) — unchanged full layout ─────────────────────── */}
      <nav className="hidden items-center gap-3 md:flex">
        {account ? (
          <>
            <Link
              href="/app"
              className="flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
            >
              {t("header.nav.documents")}
            </Link>
            <Link
              href="/app/workspaces"
              className="flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
            >
              {t("header.nav.workspaces")}
            </Link>
            <Link
              href="/app/brands"
              className="flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
            >
              {t("header.nav.brands")}
            </Link>

            {/* Credit usage indicator */}
            <Link
              href="/app/settings/billing"
              title={creditTitle}
              className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
            >
              <span className="tabular-nums">{creditCount}</span>
              <span className="text-ds-text-secondary/60">credits</span>
            </Link>

            <KeyboardShortcuts />
            <LanguageSwitcher />
            <UserMenu name={account.name} email={account.email}>
              <Link
                href="/app/settings/billing"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
              >
                Billing &amp; Plan
              </Link>
              <SignOutButton
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
              />
            </UserMenu>
          </>
        ) : (
          <>
            <LanguageSwitcher />
            <Link
              href="/login"
              className="flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
            >
              {t("header.nav.login")}
            </Link>
            <Link
              href="/signup"
              className="flex h-9 items-center justify-center rounded-full bg-ds-accent px-4 text-sm font-medium text-ds-text-on-accent transition hover:opacity-90"
            >
              {t("header.nav.signup")}
            </Link>
          </>
        )}
      </nav>

      {/* ── Mobile nav (<md) — condensed user menu + hamburger ───────────── */}
      <div className="flex items-center gap-1 md:hidden">
        {account ? (
          <>
            {/* Condensed user menu — just the avatar at this breakpoint */}
            <UserMenu name={account.name} email={account.email}>
              <Link
                href="/app/settings/billing"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
              >
                Billing &amp; Plan
              </Link>
              <SignOutButton
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
              />
            </UserMenu>

            {/* Hamburger — slides in a drawer with all nav links + utilities */}
            <MobileNavMenu>
              <Link
                href="/app"
                className="flex h-10 items-center rounded-lg px-3 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
              >
                {t("header.nav.documents")}
              </Link>
              <Link
                href="/app/workspaces"
                className="flex h-10 items-center rounded-lg px-3 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
              >
                {t("header.nav.workspaces")}
              </Link>
              <Link
                href="/app/brands"
                className="flex h-10 items-center rounded-lg px-3 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
              >
                {t("header.nav.brands")}
              </Link>

              {/* Credits */}
              <Link
                href="/app/settings/billing"
                title={creditTitle}
                className="flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
              >
                <span className="tabular-nums">{creditCount}</span>
                <span className="text-ds-text-secondary/60">credits</span>
              </Link>

              <div className="my-2 border-t border-ds-border-strong" />

              {/* Utilities — prevent the drawer's click-to-close from firing */}
              <MobileNavNonClosing className="flex flex-col gap-0.5">
                <LanguageSwitcher />
                <KeyboardShortcuts />
              </MobileNavNonClosing>
            </MobileNavMenu>
          </>
        ) : (
          /* Logged-out: 3 compact items always fit at 390px */
          <>
            <LanguageSwitcher />
            <Link
              href="/login"
              className="flex h-9 items-center justify-center rounded-full px-3 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
            >
              {t("header.nav.login")}
            </Link>
            <Link
              href="/signup"
              className="flex h-9 items-center justify-center rounded-full bg-ds-accent px-3 text-sm font-medium text-ds-text-on-accent transition hover:opacity-90"
            >
              {t("header.nav.signup")}
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
