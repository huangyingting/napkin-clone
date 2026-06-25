import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import {
  comparePassword,
  hashPassword,
  normalizeEmail,
  validateEmail,
  validatePasswordChange,
  validatePasswordLength,
} from "@/lib/auth/password";
import { seedSampleDocument } from "@/lib/onboarding/seed-sample-document";
import { prisma } from "@/lib/prisma";

type PrismaClientLike = typeof prisma;

const GENERIC_PASSWORD_ERROR =
  "Could not change your password. Please try again.";

export async function registerCredentialsUser(
  input: {
    name: FormDataEntryValue | string | null;
    email: FormDataEntryValue | string | null;
    password: FormDataEntryValue | string | null;
  },
  client: PrismaClientLike = prisma,
): Promise<ActionResult<{ id: string; email: string; password: string }>> {
  const name = String(input.name ?? "").trim();
  const email = normalizeEmail(input.email);
  const password = String(input.password ?? "");

  const emailValidation = validateEmail(email);
  if (!emailValidation.ok) {
    return actionError(emailValidation.message);
  }

  const passwordValidation = validatePasswordLength(password);
  if (!passwordValidation.ok) {
    return actionError(passwordValidation.message);
  }

  const existing = await client.user.findUnique({ where: { email } });
  if (existing) {
    return actionError("An account with this email already exists.");
  }

  const passwordHash = await hashPassword(password);

  let createdUser: { id: string };
  try {
    createdUser = await client.user.create({
      data: { email, name: name || null, passwordHash },
    });
  } catch {
    return actionError("Could not create your account. Please try again.");
  }

  await seedSampleDocument(createdUser.id);
  return actionOk({ id: createdUser.id, email, password });
}

export async function changePasswordForUser(
  input: {
    userId: string;
    currentPassword: FormDataEntryValue | string | null;
    newPassword: FormDataEntryValue | string | null;
    confirmPassword: FormDataEntryValue | string | null;
  },
  client: PrismaClientLike = prisma,
): Promise<ActionResult> {
  const currentPassword = String(input.currentPassword ?? "");
  const newPassword = String(input.newPassword ?? "");
  const confirmPassword = String(input.confirmPassword ?? "");

  const dbUser = await client.user.findUnique({
    where: { id: input.userId },
    select: { passwordHash: true },
  });
  if (!dbUser) {
    return actionError(GENERIC_PASSWORD_ERROR);
  }

  const validation = validatePasswordChange({ newPassword, confirmPassword });
  if (!validation.ok) {
    return actionError(validation.message);
  }

  if (dbUser.passwordHash) {
    const currentMatches =
      currentPassword.length > 0 &&
      (await comparePassword(currentPassword, dbUser.passwordHash));
    if (!currentMatches) {
      return actionError("Your current password is incorrect.");
    }

    const sameAsCurrent = await comparePassword(
      newPassword,
      dbUser.passwordHash,
    );
    if (sameAsCurrent) {
      return actionError(
        "New password must be different from your current password.",
      );
    }
  }

  const passwordHash = await hashPassword(newPassword);
  await client.user.update({
    where: { id: input.userId },
    data: { passwordHash },
  });

  return actionOk();
}
