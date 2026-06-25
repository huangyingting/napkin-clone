"use server";

import { revalidatePath } from "next/cache";

import { requireDocumentCapability } from "@/lib/auth/document-permissions";
import {
  addDocumentTag,
  disconnectDocumentTag,
  type DocumentTag,
} from "@/lib/document-management/tags";
import { requireUser } from "@/lib/session";

export type { DocumentTag };

/**
 * Adds a tag (creating it if new) to a document the user may edit, and returns
 * the document's updated tag list. Requires edit access (owner or workspace
 * editor) via `requireDocumentCapability` — a viewer or unrelated user is
 * rejected with a clear error (issue #89). A blank name is a no-op that returns
 * the current tags.
 */
export async function addTag(
  documentId: string,
  rawName: string,
): Promise<DocumentTag[]> {
  const user = await requireUser();
  await requireDocumentCapability(user.id, documentId, "edit");

  const tags = await addDocumentTag(documentId, user.id, rawName);

  revalidatePath("/app");
  return tags;
}

/**
 * Removes a tag from a document the user may edit (the tag itself is not
 * deleted) and returns the document's updated tag list. Requires edit access
 * (owner or workspace editor) via `requireDocumentCapability` — a viewer or
 * unrelated user is rejected with a clear error (issue #89).
 */
export async function removeTag(
  documentId: string,
  tagId: string,
): Promise<DocumentTag[]> {
  const user = await requireUser();
  await requireDocumentCapability(user.id, documentId, "edit");

  const tags = await disconnectDocumentTag(documentId, tagId);

  revalidatePath("/app");
  return tags;
}
