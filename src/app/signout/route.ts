import { redirect } from "next/navigation";

import { signOut } from "@/auth";

/**
 * Clears the current session and returns to the login page.
 *
 * Used to recover from a "stale" session — a cryptographically valid JWT whose
 * user no longer exists in the database (e.g. after a local database reset or a
 * deleted account). `requireUser` redirects here so the invalid cookie is
 * cleared instead of surfacing as an opaque foreign-key violation on the first
 * write. Lives outside `/app` so the (still-valid) JWT doesn't bounce it back
 * through the protected-area guard before the cookie is cleared.
 */
export async function GET() {
  await signOut({ redirect: false });
  redirect("/login");
}
