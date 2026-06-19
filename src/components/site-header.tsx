import Link from "next/link";

import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SignOutButton } from "@/components/sign-out-button";
import { UserMenu } from "@/components/user-menu";
import { createTranslator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function SiteHeader() {
  const sessionUser = await getCurrentUser();
  const locale = await getLocale();
  const t = createTranslator(locale);

  // Read the name/email fresh from the database so a just-saved profile change
  // (US-009) is reflected immediately and after reload — the JWT session token
  // still holds the name captured at sign-in. A null result (e.g. a stale JWT
  // pointing at a deleted user) falls back to the signed-out header.
  const account = sessionUser
    ? await prisma.user.findUnique({
        where: { id: sessionUser.id },
        select: { name: true, email: true },
      })
    : null;

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
            <KeyboardShortcuts />
            <LanguageSwitcher />
            <UserMenu name={account.name} email={account.email}>
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
