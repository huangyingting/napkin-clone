"use server";

import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { asWorkspaceRole, type WorkspaceRole } from "@/lib/workspace/roles";

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
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
  });

  return documents;
}
