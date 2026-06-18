"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getAccessibleDocument } from "@/lib/documents";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/**
 * Creates an empty document owned by the current user and redirects to its
 * editor. `redirect` throws `NEXT_REDIRECT`, so it must stay outside any
 * try/catch and run after the document is created.
 */
export async function createDocument() {
  const user = await requireUser();

  const document = await prisma.document.create({
    data: { ownerId: user.id },
    select: { id: true },
  });

  revalidatePath("/app");
  redirect(`/app/documents/${document.id}`);
}

/**
 * Deletes a document the current user may access (owner or workspace member).
 *
 * Access is gated by `getAccessibleDocument`; a non-accessible id is a silent
 * no-op (we return without deleting) so the action never leaks whether a
 * document exists. The delete itself uses `deleteMany` so a concurrent removal
 * is a harmless no-op rather than a throw. The document's `Visual` and
 * `Comment` rows are removed automatically via their existing
 * `onDelete: Cascade` relations.
 */
export async function deleteDocument(id: string): Promise<void> {
  const user = await requireUser();

  const document = await getAccessibleDocument(user.id, id);
  if (!document) {
    return;
  }

  await prisma.document.deleteMany({ where: { id } });

  revalidatePath("/app");
}
