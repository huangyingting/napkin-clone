import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { isGoogleAuthConfigured } from "@/lib/auth/google-provider";
import { prisma } from "@/lib/prisma";

import {
  buildSettingsAccountViewModel,
  type SettingsAccountViewModel,
} from "./view-model";

const settingsAccountSelect = {
  name: true,
  email: true,
  image: true,
  passwordHash: true,
  emailVerified: true,
} satisfies Prisma.UserSelect;

export async function loadSettingsAccountViewModel(
  userId: string,
): Promise<SettingsAccountViewModel | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: settingsAccountSelect,
  });

  if (!user) {
    return null;
  }

  return buildSettingsAccountViewModel({
    user,
    googleConfigured: isGoogleAuthConfigured(),
  });
}
