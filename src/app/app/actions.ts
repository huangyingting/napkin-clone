"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/**
 * Creates an empty document owned by the current user and redirects to its
 * editor. `redirect` throws `NEXT_REDIRECT`, so it must stay outside any
 * try/catch and run after the document is created.
 */
export async function createDocument() {
  const user = await requireUser();

  const document = await prisma.document.create({
    data: { ownerId: user.id },
    select: { id: true },
  });

  revalidatePath("/app");
  redirect(`/app/documents/${document.id}`);
}
