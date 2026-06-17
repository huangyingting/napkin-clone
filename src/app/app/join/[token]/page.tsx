import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Join Workspace — Napkin Clone",
};

export default async function JoinWorkspacePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await requireUser();

  // Find the invite link
  const inviteLink = await prisma.inviteLink.findFirst({
    where: { token, isRevoked: false },
    include: { workspace: true },
  });

  if (!inviteLink) {
    notFound();
  }

  // Check if user is already the owner
  if (inviteLink.workspace.ownerId === user.id) {
    redirect(`/app/workspaces/${inviteLink.workspaceId}`);
  }

  // Check if user is already a member
  const existingMember = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: inviteLink.workspaceId,
      userId: user.id,
    },
  });

  if (existingMember) {
    redirect(`/app/workspaces/${inviteLink.workspaceId}`);
  }

  // Add user to workspace
  await prisma.workspaceMember.create({
    data: {
      workspaceId: inviteLink.workspaceId,
      userId: user.id,
      role: inviteLink.role,
    },
  });

  redirect(`/app/workspaces/${inviteLink.workspaceId}`);
}
