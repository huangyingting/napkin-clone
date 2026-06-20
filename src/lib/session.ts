import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Returns the currently authenticated user, or `null` when no valid session
 * exists. Safe to call from any server component, route handler, or action.
 */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/**
 * Returns the currently authenticated user, or redirects to the login page when
 * no valid session exists. Use in protected server components and actions as the
 * secure, server-side guard (the Edge middleware only performs an optimistic
 * check).
 *
 * Also defends against a "stale" session: with the JWT strategy the session can
 * be cryptographically valid while its user row no longer exists in the database
 * (e.g. after a local database reset or a deleted account). Left unchecked, the
 * missing owner surfaces as an opaque foreign-key violation on the first write
 * (`document.create({ ownerId })`). When the user can't be found we route to
 * `/signout`, which clears the stale cookie and returns to login.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  const exists = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true },
  });
  if (!exists) {
    redirect("/signout");
  }

  return user;
}
