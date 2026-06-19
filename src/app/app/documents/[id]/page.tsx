import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { markdownToLexicalState } from "@/lib/lexical/from-markdown";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

import { listComments } from "./comments-actions";
import { LexicalEditor } from "./lexical-editor";

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
      contentJson: true,
      isShared: true,
      shareId: true,
      slug: true,
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

  // The Lexical editor's content (including inline visual cards) lives in
  // `contentJson`. Legacy documents that only have Markdown `content` are
  // converted on first open; the first edit then persists `contentJson`.
  const initialStateJson = document.contentJson
    ? JSON.stringify(document.contentJson)
    : document.content
      ? markdownToLexicalState(document.content)
      : null;

  // Comment threads for everyone with access (owner + workspace members).
  const initialComments = await listComments(document.id);

  return (
    <LexicalEditor
      documentId={document.id}
      initialTitle={document.title}
      initialStateJson={initialStateJson}
      initialIsShared={document.isShared}
      initialShareId={document.shareId}
      initialSlug={document.slug}
      canEdit={canEdit}
      workspaceName={document.workspace?.name}
      userName={user.name ?? user.email ?? "Anonymous"}
      currentUserId={user.id}
      initialComments={initialComments}
    />
  );
}
