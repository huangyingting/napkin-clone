import { signOut } from "@/auth";

const defaultClass =
  "flex h-9 items-center justify-center rounded-full border border-ds-border-strong px-4 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary";

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
