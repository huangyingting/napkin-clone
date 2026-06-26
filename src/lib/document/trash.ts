import type { Prisma } from "@/generated/prisma/client";
import { acquirePurgeLock, INVITE_LINK_RETENTION_MS } from "@/lib/maintenance";
import { prisma } from "@/lib/prisma";
import { SOFT_DELETE_RETENTION_MS } from "@/lib/trash";

type TrashDb = Pick<typeof prisma, "document">;
type MaintenanceDb = Pick<typeof prisma, "document" | "$executeRaw">;

export async function softDeleteDocument(
  id: string,
  db: TrashDb = prisma,
): Promise<void> {
  await db.document.updateMany({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function restoreDocumentFromTrash(
  id: string,
  db: TrashDb = prisma,
): Promise<void> {
  await db.document.updateMany({
    where: { id, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
}

export type MaintenancePolicy = "dashboard-load";

export type MaintenanceResult = {
  policy: MaintenancePolicy;
  skipped: boolean;
};

export async function runDocumentMaintenance(
  policy: MaintenancePolicy,
  db: MaintenanceDb = prisma,
  now: Date = new Date(),
): Promise<MaintenanceResult> {
  if (policy === "dashboard-load" && !acquirePurgeLock(now.getTime())) {
    return { policy, skipped: true };
  }

  const docCutoff = new Date(now.getTime() - SOFT_DELETE_RETENTION_MS);
  const inviteCutoff = new Date(now.getTime() - INVITE_LINK_RETENTION_MS);

  await Promise.all([
    db.document.deleteMany({
      where: { deletedAt: { lt: docCutoff } },
    }),

    db.$executeRaw`
      DELETE FROM "InviteLink"
      WHERE "createdAt" < ${inviteCutoff}
        AND (
          "isRevoked" = ${true}
          OR ("expiresAt" IS NOT NULL AND "expiresAt" < ${inviteCutoff})
          OR ("maxUses" IS NOT NULL AND "useCount" >= "maxUses")
        )
    ` as Prisma.PrismaPromise<unknown>,
  ]);

  return { policy, skipped: false };
}

export async function runDashboardLoadMaintenance(): Promise<MaintenanceResult> {
  return runDocumentMaintenance("dashboard-load");
}
