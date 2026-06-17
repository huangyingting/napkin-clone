"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export async function createWorkspace(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const user = await requireUser();

  const name = formData.get("name");
  if (!name || typeof name !== "string" || name.trim() === "") {
    return "Workspace name is required.";
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: name.trim(),
      ownerId: user.id,
    },
  });

  revalidatePath("/app/workspaces");
  return `/app/workspaces/${workspace.id}`;
}
