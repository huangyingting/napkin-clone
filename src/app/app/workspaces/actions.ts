"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/session";
import { createWorkspaceForUser } from "@/lib/workspace/service";

export async function createWorkspace(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const user = await requireUser(redirect);

  const name = formData.get("name");
  if (!name || typeof name !== "string" || name.trim() === "") {
    return "Workspace name is required.";
  }

  const workspace = await createWorkspaceForUser(user.id, name);

  revalidatePath("/app/workspaces");
  return `/app/workspaces/${workspace.id}`;
}
