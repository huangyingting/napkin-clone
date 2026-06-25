import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loadDocumentEditorViewModel } from "@/lib/document-editor/loader";
import { requireUser } from "@/lib/session";

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
  const viewModel = await loadDocumentEditorViewModel({
    documentId: id,
    userId: user.id,
    userName: user.name ?? user.email ?? "Anonymous",
  });

  if (!viewModel) {
    notFound();
  }

  return (
    <LexicalEditor
      documentId={viewModel.documentId}
      initialTitle={viewModel.initialTitle}
      initialStateJson={viewModel.initialStateJson}
      initialDeckJson={viewModel.initialDeckJson}
      initialIsShared={viewModel.initialIsShared}
      initialShareId={viewModel.initialShareId}
      initialSlug={viewModel.initialSlug}
      initialShareExpiresAt={viewModel.initialShareExpiresAt}
      initialShareEmbedEnabled={viewModel.initialShareEmbedEnabled}
      initialSharePresentEnabled={viewModel.initialSharePresentEnabled}
      canEdit={viewModel.canEdit}
      canManage={viewModel.canManage}
      workspaceName={viewModel.workspaceName}
      userName={viewModel.userName}
      initialComments={viewModel.initialComments}
      initialTags={viewModel.initialTags}
      allTags={viewModel.allTags}
    />
  );
}
