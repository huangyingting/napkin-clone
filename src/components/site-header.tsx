import Link from "next/link";

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
    <header className="flex w-full items-center justify-between border-b border-black/[.06] bg-white/80 px-6 py-3 backdrop-blur dark:border-white/[.08] dark:bg-black/40">
      <Link
        href="/"
        className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
      >
        Napkin Clone
      </Link>

      <nav className="flex items-center gap-3">
        {account ? (
          <>
            <Link
              href="/app"
              className="flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Documents
            </Link>
            <Link
              href="/app/workspaces"
              className="flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Workspaces
            </Link>
            <UserMenu name={account.name} email={account.email}>
              <SignOutButton
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              />
            </UserMenu>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="flex h-9 items-center justify-center rounded-full bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
