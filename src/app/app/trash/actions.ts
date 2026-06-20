"use server";

import { revalidatePath } from "next/cache";

import { requireDocumentCapability } from "@/lib/auth/document-permissions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/**
 * Permanently removes a single soft-deleted document (hard delete). Requires
 * manage access (owner-level), authorized via `requireDocumentCapability` with
 * `includeDeleted` so the soft-deleted row is visible to the permission check.
 * The associated `Visual`/`Comment` rows cascade away via the existing
 * `onDelete: Cascade` relations.
 *
 * The write uses `deleteMany` with `deletedAt: { not: null }` as a safety guard
 * so a document that has been restored between the UI load and this call is
 * never accidentally hard-deleted.
 */
export async function permanentDeleteDocument(id: string): Promise<void> {
  const user = await requireUser();

  await requireDocumentCapability(user.id, id, "manage", {
    includeDeleted: true,
  });

  await prisma.document.deleteMany({
    where: { id, deletedAt: { not: null } },
  });

  revalidatePath("/app/trash");
  revalidatePath("/app");
}
