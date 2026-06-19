import Link from "next/link";

import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { SignOutButton } from "@/components/sign-out-button";
import { UserMenu } from "@/components/user-menu";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function SiteHeader() {
  const sessionUser = await getCurrentUser();

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
        Napkin Clone
      </Link>

      <nav className="flex items-center gap-3">
        {account ? (
          <>
            <Link
              href="/app"
              className="flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-ghost-secondary transition hover:bg-ghost-wash hover:text-ghost-text"
            >
              Documents
            </Link>
            <Link
              href="/app/workspaces"
              className="flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-ghost-secondary transition hover:bg-ghost-wash hover:text-ghost-text"
            >
              Workspaces
            </Link>
            <Link
              href="/app/brands"
              className="flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-ghost-secondary transition hover:bg-ghost-wash hover:text-ghost-text"
            >
              Brands
            </Link>
            <KeyboardShortcuts />
            <UserMenu name={account.name} email={account.email}>
              <SignOutButton
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-ghost-secondary transition hover:bg-ghost-wash hover:text-ghost-text"
              />
            </UserMenu>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-ghost-secondary transition hover:bg-ghost-wash hover:text-ghost-text"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="flex h-9 items-center justify-center rounded-full bg-ghost-accent px-4 text-sm font-medium text-white transition hover:opacity-90"
            >
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
