import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { documentCapabilities } from "@/lib/auth/document-permissions";
import { markdownToLexicalState } from "@/lib/lexical/from-markdown";
import { prisma } from "@/lib/prisma";
import { normalizeDeckRaw } from "@/lib/presentation/fresh-deck";
import { requireUser } from "@/lib/session";

import { listComments } from "./comments-actions";
import { LexicalEditor } from "./lexical-editor";

export const metadata: Metadata = {
  title: "Editor — TextIQ",
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
      deckJson: true,
      isShared: true,
      shareId: true,
      slug: true,
      shareExpiresAt: true,
      shareEmbedEnabled: true,
      sharePresentEnabled: true,
      ownerId: true,
      workspaceId: true,
      tags: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true },
      },
      workspace: {
        select: {
          name: true,
          ownerId: true,
          members: {
            where: { userId: user.id },
            select: { userId: true, role: true },
          },
        },
      },
    },
  });

  if (!document) {
    notFound();
  }

  // Derive the acting user's capabilities from the single role-aware helper so
  // the UI and the server actions agree on what this user may do (issue #89).
  const { canEdit, canManage } = documentCapabilities(document, user.id);

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

  // The acting user's tags, for the add-tag autocomplete suggestions.
  const userTags = await prisma.tag.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });

  return (
    <LexicalEditor
      documentId={document.id}
      initialTitle={document.title}
      initialStateJson={initialStateJson}
      initialDeckJson={normalizeDeckRaw(document.deckJson)}
      initialIsShared={document.isShared}
      initialShareId={document.shareId}
      initialSlug={document.slug}
      initialShareExpiresAt={
        document.shareExpiresAt ? document.shareExpiresAt.toISOString() : null
      }
      initialShareEmbedEnabled={document.shareEmbedEnabled}
      initialSharePresentEnabled={document.sharePresentEnabled}
      canEdit={canEdit}
      canManage={canManage}
      workspaceName={document.workspace?.name}
      userName={user.name ?? user.email ?? "Anonymous"}
      currentUserId={user.id}
      initialComments={initialComments}
      initialTags={document.tags}
      allTags={userTags}
    />
  );
}
