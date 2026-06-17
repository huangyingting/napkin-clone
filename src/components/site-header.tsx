import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentUser } from "@/lib/session";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="flex w-full items-center justify-between border-b border-black/[.06] bg-white/80 px-6 py-3 backdrop-blur dark:border-white/[.08] dark:bg-black/40">
      <Link
        href="/"
        className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
      >
        Napkin Clone
      </Link>

      <nav className="flex items-center gap-3">
        {user ? (
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
            <span className="hidden text-sm text-zinc-600 sm:inline dark:text-zinc-400">
              {user.email}
            </span>
            <SignOutButton />
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
