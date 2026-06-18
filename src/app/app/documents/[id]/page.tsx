import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { safeParseVisual, type Visual } from "@/lib/visual/schema";

import { listComments } from "./comments-actions";
import { DocumentEditor } from "./document-editor";

export const metadata: Metadata = {
  title: "Editor — Napkin Clone",
};

export default async function DocumentEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  // Check if user owns the document or has workspace access
  const document = await prisma.document.findFirst({
    where: {
      id,
      deletedAt: null,
      OR: [
        { ownerId: user.id },
        {
          workspaceId: { not: null },
          workspace: {
            OR: [
              { ownerId: user.id },
              { members: { some: { userId: user.id } } },
            ],
          },
        },
      ],
    },
    select: {
      id: true,
      title: true,
      content: true,
      isShared: true,
      shareId: true,
      ownerId: true,
      workspaceId: true,
      workspace: {
        select: {
          name: true,
          members: {
            where: { userId: user.id },
            select: { role: true },
          },
        },
      },
      // All visuals for this document: the document-level one (anchorBlockId =
      // null) renders in the right panel; block-anchored visuals (US-009) are
      // shown inline near their source block in the preview (US-010).
      visuals: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: { anchorBlockId: true, data: true },
      },
    },
  });

  if (!document) {
    notFound();
  }

  // Determine user's role for this document
  const isOwner = document.ownerId === user.id;
  const workspaceRole = document.workspace?.members[0]?.role;
  const canEdit =
    isOwner || workspaceRole === "OWNER" || workspaceRole === "EDITOR";

  // Tolerate legacy/garbled stored data: only pass through valid visuals.
  // Split into the document-level visual (anchorBlockId = null) and a map of
  // block-anchored visuals keyed by their anchor block id.
  let initialVisual: Visual | null = null;
  const initialBlockVisuals: Record<string, Visual> = {};
  for (const row of document.visuals) {
    const parsed = safeParseVisual(row.data);
    if (!parsed.success) {
      continue;
    }
    if (row.anchorBlockId === null) {
      initialVisual ??= parsed.data;
    } else if (!(row.anchorBlockId in initialBlockVisuals)) {
      initialBlockVisuals[row.anchorBlockId] = parsed.data;
    }
  }

  // Comment threads for everyone with access (owner + workspace members).
  const initialComments = await listComments(document.id);

  return (
    <DocumentEditor
      id={document.id}
      initialTitle={document.title}
      initialContent={document.content}
      initialVisual={initialVisual}
      initialBlockVisuals={initialBlockVisuals}
      initialIsShared={document.isShared}
      initialShareId={document.shareId}
      canEdit={canEdit}
      workspaceName={document.workspace?.name}
      userName={user.name ?? user.email ?? "Anonymous"}
      currentUserId={user.id}
      initialComments={initialComments}
    />
  );
}
