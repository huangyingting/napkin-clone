"use server";

import { nanoid } from "nanoid";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { BLANK_TEMPLATE_ID, getTemplateOrBlank } from "@/lib/templates/catalog";
import { asWorkspaceRole, type WorkspaceRole } from "@/lib/workspace/roles";

/** Maximum stored document title length (mirrors the editor's title save). */
const MAX_TITLE_LENGTH = 200;

/** Maximum stored document content length. */
const MAX_CONTENT_LENGTH = 100_000;

/**
 * Ensures the current user is a workspace OWNER or EDITOR. Throws if the user
 * is a VIEWER, not a member, or the workspace does not exist. This check is the
 * server-side enforcement gate for workspace document mutations.
 */
async function requireWorkspaceMutator(
  userId: string,
  workspaceId: string,
): Promise<void> {
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      OR: [
        { ownerId: userId },
        { members: { some: { userId, role: "EDITOR" } } },
      ],
    },
    select: { id: true },
  });

  if (!workspace) {
    throw new Error(
      "Unauthorized: only workspace owners and editors may create or import documents.",
    );
  }
}

export type InviteLink = {
  id: string;
  token: string;
  role: WorkspaceRole;
  createdAt: Date;
};

export type WorkspaceDocument = {
  id: string;
  title: string;
  updatedAt: Date;
};

export async function createInviteLink(
  workspaceId: string,
  role: WorkspaceRole,
): Promise<InviteLink> {
  const user = await requireUser();

  // Verify user is the workspace owner
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, ownerId: user.id },
  });

  if (!workspace) {
    throw new Error("Workspace not found or unauthorized.");
  }

  const inviteLink = await prisma.inviteLink.create({
    data: {
      workspaceId,
      token: nanoid(16),
      role,
      createdById: user.id,
    },
    select: { id: true, token: true, role: true, createdAt: true },
  });

  revalidatePath(`/app/workspaces/${workspaceId}`);
  return { ...inviteLink, role: asWorkspaceRole(inviteLink.role) };
}

export async function revokeInviteLink(linkId: string): Promise<void> {
  const user = await requireUser();

  // Verify user owns the workspace
  const link = await prisma.inviteLink.findFirst({
    where: { id: linkId },
    include: { workspace: true },
  });

  if (!link || link.workspace.ownerId !== user.id) {
    throw new Error("Invite link not found or unauthorized.");
  }

  await prisma.inviteLink.update({
    where: { id: linkId },
    data: { isRevoked: true },
  });

  revalidatePath(`/app/workspaces/${link.workspaceId}`);
}

export async function removeMember(memberId: string): Promise<void> {
  const user = await requireUser();

  // Verify user owns the workspace
  const member = await prisma.workspaceMember.findFirst({
    where: { id: memberId },
    include: { workspace: true },
  });

  if (!member || member.workspace.ownerId !== user.id) {
    throw new Error("Member not found or unauthorized.");
  }

  await prisma.workspaceMember.delete({
    where: { id: memberId },
  });

  revalidatePath(`/app/workspaces/${member.workspaceId}`);
}

export async function getWorkspaceDocuments(
  workspaceId: string,
): Promise<WorkspaceDocument[]> {
  const user = await requireUser();

  // Verify user has access to the workspace
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
    },
  });

  if (!workspace) {
    throw new Error("Workspace not found or unauthorized.");
  }

  const documents = await prisma.document.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
  });

  return documents;
}

/**
 * Creates a new document seeded from a starter template inside a workspace,
 * then redirects to its editor.
 *
 * The caller's workspace role is checked server-side: only OWNER and EDITOR
 * may proceed; a VIEWER (or non-member) receives an authorization error.
 * `workspaceId` is stored on the document so it appears in both the workspace
 * document list and the dashboard lists.
 */
export async function createWorkspaceDocument(
  workspaceId: string,
  templateId: string,
): Promise<void> {
  const user = await requireUser();
  await requireWorkspaceMutator(user.id, workspaceId);

  const template = getTemplateOrBlank(templateId);
  const content = template.id === BLANK_TEMPLATE_ID ? "" : template.content;

  const document = await prisma.document.create({
    data: { ownerId: user.id, workspaceId, content },
    select: { id: true },
  });

  revalidatePath("/app");
  revalidatePath(`/app/workspaces/${workspaceId}`);
  redirect(`/app/documents/${document.id}`);
}

/**
 * Creates a document from pre-extracted import text inside a workspace, then
 * redirects to its editor.
 *
 * The caller's workspace role is checked server-side: only OWNER and EDITOR
 * may proceed; a VIEWER (or non-member) receives an authorization error.
 * `workspaceId` is stored on the document so it appears in both the workspace
 * document list and the dashboard lists.
 */
export async function importWorkspaceDocument(
  workspaceId: string,
  content: string,
  rawTitle: string,
): Promise<void> {
  const user = await requireUser();
  await requireWorkspaceMutator(user.id, workspaceId);

  const title =
    rawTitle.trim().slice(0, MAX_TITLE_LENGTH) || "Imported document";
  const safeContent = content.slice(0, MAX_CONTENT_LENGTH);

  const document = await prisma.document.create({
    data: { ownerId: user.id, workspaceId, title, content: safeContent },
    select: { id: true },
  });

  revalidatePath("/app");
  revalidatePath(`/app/workspaces/${workspaceId}`);
  redirect(`/app/documents/${document.id}`);
}
