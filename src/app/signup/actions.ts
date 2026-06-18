"use server";

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";

import { signIn } from "@/auth";
import { seedSampleDocument } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export async function register(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!EMAIL_PATTERN.test(email)) {
    return "Enter a valid email address.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return "An account with this email already exists.";
  }

  const passwordHash = await bcrypt.hash(password, 12);

  let createdUser;
  try {
    createdUser = await prisma.user.create({
      data: { email, name: name || null, passwordHash },
    });
  } catch {
    return "Could not create your account. Please try again.";
  }

  // First-run experience: seed a sample document before sign-in redirects.
  await seedSampleDocument(createdUser.id);

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      return "Account created, but automatic sign-in failed. Please log in.";
    }
    throw error;
  }

  return undefined;
}
