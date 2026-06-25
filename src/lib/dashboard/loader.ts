import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { listDashboardDocumentsForUser } from "@/lib/document-management/list";
import type { Locale } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { runDashboardLoadMaintenance } from "@/lib/document-management/trash";

import { buildDashboardViewModel, type DashboardViewModel } from "./view-model";

const dashboardUserSelect = {
  onboardingDismissed: true,
} satisfies Prisma.UserSelect;

function dashboardVisualCountWhere(userId: string): Prisma.VisualWhereInput {
  return {
    document: {
      deletedAt: null,
      OR: [
        { ownerId: userId },
        {
          workspace: {
            OR: [{ ownerId: userId }, { members: { some: { userId } } }],
          },
        },
      ],
    },
  };
}

export async function loadDashboardViewModel({
  userId,
  userEmail,
  locale,
}: {
  userId: string;
  userEmail: string;
  locale: Locale;
}): Promise<DashboardViewModel> {
  await runDashboardLoadMaintenance();

  const [dbUser, documentList, visualCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: dashboardUserSelect,
    }),
    listDashboardDocumentsForUser(userId),
    prisma.visual.count({ where: dashboardVisualCountWhere(userId) }),
  ]);

  return buildDashboardViewModel({
    userEmail,
    locale,
    documentList,
    onboardingDismissed: dbUser?.onboardingDismissed ?? false,
    hasVisuals: visualCount > 0,
  });
}
