"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { requireDocumentActionContext } from "./document-context";
import { requireDocumentCapability } from "@/lib/auth/document-permissions";
import { stampBlockIds } from "@/lib/lexical/block-id";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { logInfo, logError } from "@/lib/log";
import {
  atomicSaveDocumentLexical,
  rebuildMirror,
  type VisualMirrorOutcome,
} from "@/lib/document/persistence-service";
import {
  LEXICAL_STATE_MAX_LENGTH,
  formatLexicalStateTooLargeError,
} from "@/lib/limits";

/**
 * Saves the serialized Lexical editor state for a document.
 *
 * Permission-checked (edit access required). Delegates all persistence
 * orchestration — atomic contentJson write + visual mirror rebuild — to
 * {@link atomicSaveDocumentLexical} in the persistence service (#474, #470).
 */
export async function saveDocumentLexical(
  id: string,
  stateJson: string,
): Promise<ActionResult<VisualMirrorOutcome>> {
  const user = await requireUser(redirect);

  if (stateJson.length > LEXICAL_STATE_MAX_LENGTH) {
    return actionError(formatLexicalStateTooLargeError());
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stateJson);
  } catch {
    return actionError("Invalid editor state.");
  }

  parsed = stampBlockIds(parsed);

  await requireDocumentCapability(user.id, id, "edit");

  const outcome = await atomicSaveDocumentLexical(id, parsed, user.id);

  revalidatePath("/app");
  return actionOk(outcome);
}

/**
 * Idempotent server action that rebuilds all `Visual` rows for a document
 * purely from its current `contentJson` (issue #451).
 *
 * Delegates to {@link rebuildMirror} in the persistence service after
 * permission checks. Does NOT snapshot, update `contentJson`, or touch any
 * other document fields. Running it twice without intermediate edits is a
 * no-op. Permission-checked: requires edit access to the document.
 */
export async function rebuildVisualMirror(
  documentId: string,
): Promise<ActionResult<VisualMirrorOutcome>> {
  await requireDocumentActionContext(documentId, "edit");

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { contentJson: true },
  });

  if (!doc) {
    return actionError("Document not found.");
  }

  if (doc.contentJson == null) {
    const empty: VisualMirrorOutcome = {
      created: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      invalid: 0,
    };
    logInfo("visual.rebuild", "rebuild skipped: no contentJson", {
      documentId,
    });
    return actionOk(empty);
  }

  try {
    const outcome = await rebuildMirror(documentId, doc.contentJson);
    revalidatePath("/app");
    return actionOk(outcome);
  } catch (err) {
    logError(
      "visual.rebuild",
      err instanceof Error ? err : new Error(String(err)),
      { documentId },
    );
    return actionError("Failed to rebuild visual mirror.");
  }
}
