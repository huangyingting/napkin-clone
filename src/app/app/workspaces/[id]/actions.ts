"use server";

import { nanoid } from "nanoid";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { DOCUMENT_LIST_LIMIT, capList } from "@/lib/documents";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { BLANK_TEMPLATE_ID, getTemplateOrBlank } from "@/lib/templates/catalog";
import {
  asWorkspaceRole,
  isInvitableWorkspaceRole,
  type WorkspaceRole,
} from "@/lib/workspace/roles";

/** Maximum stored document title length (mirrors the editor's title save). */
const MAX_TITLE_LENGTH = 200;

/** Maximum stored document content length. */
const MAX_CONTENT_LENGTH = 100_000;

/** Maximum stored workspace name length. */
const MAX_WORKSPACE_NAME_LENGTH = 100;

/**
 * Ensures the current user is the workspace OWNER and returns the workspace id.
 * Throws if the user is not the owner or the workspace does not exist. This is
 * the server-side enforcement gate for owner-only lifecycle actions (rename,
 * delete, transfer ownership).
 */
async function requireWorkspaceOwner(
  userId: string,
  workspaceId: string,
): Promise<{ id: string }> {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, ownerId: userId },
    select: { id: true },
  });

  if (!workspace) {
    throw new Error(
      "Unauthorized: only the workspace owner may perform this action.",
    );
  }

  return workspace;
}

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
  expiresAt: Date | null;
  maxUses: number | null;
  useCount: number;
};

/** Options accepted when creating an invite link (issue #103). */
export type CreateInviteLinkOptions = {
  /**
   * Days until the link expires. `null`/omitted = never expires. Expiry is
   * computed server-side from the current time so the client clock is never
   * trusted.
   */
  expiresInDays?: number | null;
  /** Maximum accepted joins. `null`/omitted = unlimited. */
  maxUses?: number | null;
};

export type WorkspaceDocument = {
  id: string;
  title: string;
  updatedAt: Date;
};

/** Result of {@link getWorkspaceDocuments}: capped documents plus `hasMore`. */
export type WorkspaceDocumentsResult = {
  documents: WorkspaceDocument[];
  hasMore: boolean;
};

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

/** Largest accepted expiry window, guarding against overflow/typos. */
const MAX_EXPIRY_DAYS = 365;

/** Largest accepted usage cap. */
const MAX_USES_LIMIT = 10_000;

export async function createInviteLink(
  workspaceId: string,
  role: WorkspaceRole,
  options: CreateInviteLinkOptions = {},
): Promise<InviteLink> {
  const user = await requireUser();

  // Validate the requested role SERVER-SIDE against the invitable roles; never
  // trust the client to send a permissible value (issue #103). OWNER and any
  // unknown value are rejected here rather than persisted.
  if (!isInvitableWorkspaceRole(role)) {
    throw new Error(`Invalid invite role: ${String(role)}.`);
  }

  // Verify user is the workspace owner
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, ownerId: user.id },
  });

  if (!workspace) {
    throw new Error("Workspace not found or unauthorized.");
  }

  const expiresAt = normalizeExpiry(options.expiresInDays);
  const maxUses = normalizeMaxUses(options.maxUses);

  const inviteLink = await prisma.inviteLink.create({
    data: {
      workspaceId,
      token: nanoid(16),
      role,
      createdById: user.id,
      expiresAt,
      maxUses,
    },
    select: {
      id: true,
      token: true,
      role: true,
      createdAt: true,
      expiresAt: true,
      maxUses: true,
      useCount: true,
    },
  });

  revalidatePath(`/app/workspaces/${workspaceId}`);
  return { ...inviteLink, role: asWorkspaceRole(inviteLink.role) };
}

/** Converts an optional expiry window in days to an absolute timestamp. */
function normalizeExpiry(expiresInDays?: number | null): Date | null {
  if (expiresInDays === null || expiresInDays === undefined) {
    return null;
  }
  if (
    !Number.isFinite(expiresInDays) ||
    expiresInDays <= 0 ||
    expiresInDays > MAX_EXPIRY_DAYS
  ) {
    throw new Error(`Invalid invite expiry: ${String(expiresInDays)} days.`);
  }
  return new Date(Date.now() + expiresInDays * MILLIS_PER_DAY);
}

/** Validates an optional usage cap. */
function normalizeMaxUses(maxUses?: number | null): number | null {
  if (maxUses === null || maxUses === undefined) {
    return null;
  }
  if (!Number.isInteger(maxUses) || maxUses <= 0 || maxUses > MAX_USES_LIMIT) {
    throw new Error(`Invalid invite usage limit: ${String(maxUses)}.`);
  }
  return maxUses;
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

  // Document handoff: move documents the removed member owns within this
  // workspace back to their personal space (workspaceId = null). This preserves
  // the member's authorship and access to their own content rather than handing
  // it to the workspace owner (privacy-preserving), and avoids stranding docs in
  // a workspace the member can no longer reach.
  await prisma.$transaction([
    prisma.document.updateMany({
      where: { workspaceId: member.workspaceId, ownerId: member.userId },
      data: { workspaceId: null },
    }),
    prisma.workspaceMember.delete({ where: { id: memberId } }),
  ]);

  revalidatePath("/app");
  revalidatePath(`/app/workspaces/${member.workspaceId}`);
}

/**
 * Renames a workspace. OWNER-only: the server re-checks ownership against
 * `Workspace.ownerId` and never trusts the client. The name is trimmed and
 * length-capped; an empty name is rejected.
 */
export async function renameWorkspace(
  workspaceId: string,
  rawName: string,
): Promise<void> {
  const user = await requireUser();
  await requireWorkspaceOwner(user.id, workspaceId);

  const name = rawName.trim().slice(0, MAX_WORKSPACE_NAME_LENGTH);
  if (name === "") {
    throw new Error("Workspace name is required.");
  }

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { name },
  });

  revalidatePath("/app/workspaces");
  revalidatePath(`/app/workspaces/${workspaceId}`);
}

/**
 * Deletes a workspace. OWNER-only.
 *
 * Document handoff: before deletion, every document still attached to the
 * workspace is reassigned to its owner's personal space (`workspaceId = null`).
 * No document is ever deleted — each survives in the personal space of whoever
 * authored it. (The schema's `onDelete: SetNull` on the document→workspace
 * relation would null these out anyway; doing it explicitly keeps the behavior
 * intentional and self-documenting.) Members and invite links cascade-delete
 * with the workspace.
 */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const user = await requireUser();
  await requireWorkspaceOwner(user.id, workspaceId);

  await prisma.$transaction([
    prisma.document.updateMany({
      where: { workspaceId },
      data: { workspaceId: null },
    }),
    prisma.workspace.delete({ where: { id: workspaceId } }),
  ]);

  revalidatePath("/app");
  revalidatePath("/app/workspaces");
  redirect("/app/workspaces");
}

/**
 * Lets the current user leave a workspace by deleting their own membership.
 *
 * Any non-owner member (EDITOR or VIEWER) may leave. The OWNER cannot leave —
 * doing so would orphan the workspace — so they receive a clear error directing
 * them to transfer ownership first. Documents the leaving member authored keep
 * their `ownerId`, so they remain accessible to that member in their personal
 * lists; only the membership row is removed.
 */
export async function leaveWorkspace(workspaceId: string): Promise<void> {
  const user = await requireUser();

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId },
    select: { ownerId: true },
  });

  if (!workspace) {
    throw new Error("Workspace not found or unauthorized.");
  }

  if (workspace.ownerId === user.id) {
    throw new Error(
      "The workspace owner cannot leave. Transfer ownership to another member first.",
    );
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: user.id },
    select: { id: true },
  });

  if (!membership) {
    throw new Error("You are not a member of this workspace.");
  }

  await prisma.workspaceMember.delete({ where: { id: membership.id } });

  revalidatePath("/app");
  revalidatePath("/app/workspaces");
  redirect("/app/workspaces");
}

/**
 * Transfers workspace ownership to another existing member. OWNER-only.
 *
 * Ownership is modeled by `Workspace.ownerId` (the owner is not a
 * `WorkspaceMember` row), so the transfer, run atomically:
 *   1. promotes `newOwnerUserId` by setting `Workspace.ownerId`,
 *   2. removes the new owner's now-redundant membership row, and
 *   3. demotes the previous owner into an EDITOR membership row,
 * preserving the invariant "the owner has no member row; everyone else does."
 * The target must already be a member of the workspace.
 */
export async function transferOwnership(
  workspaceId: string,
  newOwnerUserId: string,
): Promise<void> {
  const user = await requireUser();
  await requireWorkspaceOwner(user.id, workspaceId);

  if (newOwnerUserId === user.id) {
    throw new Error("You already own this workspace.");
  }

  const newOwnerMembership = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: newOwnerUserId },
    select: { id: true },
  });

  if (!newOwnerMembership) {
    throw new Error("New owner must be an existing member of the workspace.");
  }

  await prisma.$transaction([
    prisma.workspace.update({
      where: { id: workspaceId },
      data: { ownerId: newOwnerUserId },
    }),
    prisma.workspaceMember.delete({ where: { id: newOwnerMembership.id } }),
    prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
      create: { workspaceId, userId: user.id, role: "EDITOR" },
      update: { role: "EDITOR" },
    }),
  ]);

  revalidatePath("/app");
  revalidatePath("/app/workspaces");
  revalidatePath(`/app/workspaces/${workspaceId}`);
}

export async function getWorkspaceDocuments(
  workspaceId: string,
): Promise<WorkspaceDocumentsResult> {
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

  // Cap the list at DOCUMENT_LIST_LIMIT (one extra row flags `hasMore`).
  const rows = await prisma.document.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: DOCUMENT_LIST_LIMIT + 1,
    select: { id: true, title: true, updatedAt: true },
  });

  const { items, hasMore } = capList(rows, DOCUMENT_LIST_LIMIT);
  return { documents: items, hasMore };
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
