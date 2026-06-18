"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/** Maximum stored display-name length. */
const MAX_NAME_LENGTH = 100;

export type ProfileFormState =
  | { status: "idle" }
  | { status: "success"; name: string }
  | { status: "error"; message: string };

/**
 * Updates the current user's display name.
 *
 * The write is scoped to the authenticated user by keying on the session
 * `user.id` (never a client-supplied id), so it can only change the caller's own
 * profile. The name is trimmed and length-clamped; an empty value clears the name
 * (stored as `null`) so the header/menu falls back to the email.
 *
 * The header user menu and dashboard greeting read the name/email server-side
 * from the database, so revalidating the root layout makes a saved change show
 * immediately and persist after reload (the JWT session token still holds the
 * name captured at sign-in).
 */
export async function updateProfile(
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, MAX_NAME_LENGTH);

  await prisma.user.update({
    where: { id: user.id },
    data: { name: name || null },
  });

  revalidatePath("/app/settings");
  revalidatePath("/", "layout");

  return { status: "success", name };
}
