import { nanoid } from "nanoid";

import { prisma } from "@/lib/prisma";
import {
  asWorkspaceRole,
  isInvitableWorkspaceRole,
  type WorkspaceRole,
} from "@/lib/workspace/roles";

export type InviteLink = {
  id: string;
  token: string;
  role: WorkspaceRole;
  createdAt: Date;
  expiresAt: Date | null;
  maxUses: number | null;
  useCount: number;
};

export type CreateInviteLinkOptions = {
  expiresInDays?: number | null;
  maxUses?: number | null;
};

export type InviteLinkTarget = {
  workspaceId: string;
};

export type WorkspaceMemberRemovalTarget = {
  workspaceId: string;
  userId: string;
};

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

/** Largest accepted expiry window, guarding against overflow/typos. */
export const MAX_INVITE_EXPIRY_DAYS = 365;

/** Largest accepted usage cap. */
export const MAX_INVITE_USES_LIMIT = 10_000;

/** Maximum stored workspace name length. */
export const MAX_WORKSPACE_NAME_LENGTH = 100;

/** Converts an optional expiry window in days to an absolute timestamp. */
export function normalizeInviteExpiry(
  expiresInDays?: number | null,
  now: Date = new Date(),
): Date | null {
  if (expiresInDays === null || expiresInDays === undefined) {
    return null;
  }
  if (
    !Number.isFinite(expiresInDays) ||
    expiresInDays <= 0 ||
    expiresInDays > MAX_INVITE_EXPIRY_DAYS
  ) {
    throw new Error(`Invalid invite expiry: ${String(expiresInDays)} days.`);
  }
  return new Date(now.getTime() + expiresInDays * MILLIS_PER_DAY);
}

/** Validates an optional usage cap. */
export function normalizeInviteMaxUses(maxUses?: number | null): number | null {
  if (maxUses === null || maxUses === undefined) {
    return null;
  }
  if (
    !Number.isInteger(maxUses) ||
    maxUses <= 0 ||
    maxUses > MAX_INVITE_USES_LIMIT
  ) {
    throw new Error(`Invalid invite usage limit: ${String(maxUses)}.`);
  }
  return maxUses;
}

export function normalizeWorkspaceName(rawName: string): string {
  const name = rawName.trim().slice(0, MAX_WORKSPACE_NAME_LENGTH);
  if (name === "") {
    throw new Error("Workspace name is required.");
  }
  return name;
}

export function assertInvitableWorkspaceRole(role: WorkspaceRole): void {
  if (!isInvitableWorkspaceRole(role)) {
    throw new Error(`Invalid invite role: ${String(role)}.`);
  }
}

export async function createWorkspaceInviteLink({
  workspaceId,
  role,
  createdById,
  options = {},
}: {
  workspaceId: string;
  role: WorkspaceRole;
  createdById: string;
  options?: CreateInviteLinkOptions;
}): Promise<InviteLink> {
  assertInvitableWorkspaceRole(role);

  const inviteLink = await prisma.inviteLink.create({
    data: {
      workspaceId,
      token: nanoid(16),
      role,
      createdById,
      expiresAt: normalizeInviteExpiry(options.expiresInDays),
      maxUses: normalizeInviteMaxUses(options.maxUses),
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

  return { ...inviteLink, role: asWorkspaceRole(inviteLink.role) };
}

export async function getInviteLinkTarget(
  linkId: string,
): Promise<InviteLinkTarget | null> {
  return prisma.inviteLink.findFirst({
    where: { id: linkId },
    select: { workspaceId: true },
  });
}

export async function revokeWorkspaceInviteLink(linkId: string): Promise<void> {
  await prisma.inviteLink.update({
    where: { id: linkId },
    data: { isRevoked: true },
  });
}

export async function getWorkspaceMemberRemovalTarget(
  memberId: string,
): Promise<WorkspaceMemberRemovalTarget | null> {
  return prisma.workspaceMember.findFirst({
    where: { id: memberId },
    select: { workspaceId: true, userId: true },
  });
}

export async function removeWorkspaceMemberAndDetachDocuments(
  memberId: string,
  member: WorkspaceMemberRemovalTarget,
): Promise<void> {
  await prisma.$transaction([
    prisma.document.updateMany({
      where: { workspaceId: member.workspaceId, ownerId: member.userId },
      data: { workspaceId: null },
    }),
    prisma.workspaceMember.delete({ where: { id: memberId } }),
  ]);
}

export async function renameWorkspaceRecord(
  workspaceId: string,
  rawName: string,
): Promise<void> {
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { name: normalizeWorkspaceName(rawName) },
  });
}

export async function deleteWorkspaceAndDetachDocuments(
  workspaceId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.document.updateMany({
      where: { workspaceId },
      data: { workspaceId: null },
    }),
    prisma.workspace.delete({ where: { id: workspaceId } }),
  ]);
}
