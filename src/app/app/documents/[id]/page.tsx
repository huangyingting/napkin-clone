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
      // The document's single active visual (most recently created).
      visuals: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { data: true },
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

  // Tolerate legacy/garbled stored data: only pass through a valid visual.
  const stored = document.visuals[0]?.data;
  const parsed = stored !== undefined ? safeParseVisual(stored) : null;
  const initialVisual: Visual | null =
    parsed && parsed.success ? parsed.data : null;

  // Comment threads for everyone with access (owner + workspace members).
  const initialComments = await listComments(document.id);

  return (
    <DocumentEditor
      id={document.id}
      initialTitle={document.title}
      initialContent={document.content}
      initialVisual={initialVisual}
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
