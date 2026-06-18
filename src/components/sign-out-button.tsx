import { signOut } from "@/auth";

const defaultClass =
  "flex h-9 items-center justify-center rounded-full border border-black/10 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-zinc-900";

/**
 * Signs the current user out and returns to the marketing home. Accepts an
 * optional `className`/`role` so it can render either as a standalone pill button
 * or as a full-width item inside the header user menu.
 */
export function SignOutButton({
  className = defaultClass,
  role,
}: {
  className?: string;
  role?: string;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <button type="submit" role={role} className={className}>
        Sign out
      </button>
    </form>
  );
}
