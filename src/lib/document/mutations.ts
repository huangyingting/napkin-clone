import { prisma } from "@/lib/prisma";

type DocumentMutationDb = Pick<typeof prisma, "document">;

export async function renameDocumentTitle(
  id: string,
  title: string,
  db: DocumentMutationDb = prisma,
): Promise<void> {
  await db.document.updateMany({
    where: { id },
    data: { title },
  });
}

export async function toggleDocumentFavorite(
  id: string,
  db: DocumentMutationDb = prisma,
): Promise<{ favorite: boolean }> {
  const document = await db.document.findFirst({
    where: { id, deletedAt: null },
    select: { favorite: true },
  });

  if (!document) {
    return { favorite: false };
  }

  const favorite = !document.favorite;

  await db.document.updateMany({
    where: { id },
    data: { favorite },
  });

  return { favorite };
}
