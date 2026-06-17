import { redirect } from "next/navigation";

import { auth } from "@/auth";

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
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
