import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getTrashStatus, SOFT_DELETE_RETENTION_MS } from "@/lib/trash";

import { TrashList } from "./trash-list";

export const metadata: Metadata = {
  title: "Trash — TextIQ",
};

/** Fetches the current user's soft-deleted documents within the recovery window. */
async function fetchTrashDocuments(userId: string) {
  // Only return documents still within the recovery window; older ones are
  // purged opportunistically on the dashboard, so they should not appear here.
  const cutoff = new Date(Date.now() - SOFT_DELETE_RETENTION_MS);
  const now = new Date();

  const rows = await prisma.document.findMany({
    where: {
      ownerId: userId,
      deletedAt: { not: null, gt: cutoff },
    },
    orderBy: { deletedAt: "desc" },
    select: { id: true, title: true, deletedAt: true },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    deletedAtMs: row.deletedAt!.getTime(),
    remainingMs: getTrashStatus(row.deletedAt, now)!.remainingMs,
  }));
}

/**
 * Trash / Recently Deleted page.
 *
 * Lists the current user's soft-deleted documents that are still within the
 * 30-day recovery window (SOFT_DELETE_RETENTION_MS). Documents past the window
 * are excluded here — they will be purged opportunistically by the maintenance
 * sweep on the next dashboard load.
 *
 * Each row shows the deletion date and remaining recovery time computed via
 * `getTrashStatus`. The user can Restore (clears deletedAt) or permanently
 * Delete (hard delete) each document; both actions require manage/owner
 * capability enforced server-side.
 */
export default async function TrashPage() {
  const user = await requireUser(redirect);

  const documents = await fetchTrashDocuments(user.id);

  return (
    <main className="flex flex-1 flex-col items-center bg-ds-surface-sunken px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-ds-text-primary">
              Trash
            </h1>
            <p className="text-sm text-ds-text-secondary">
              Deleted documents are kept for 30 days, then permanently removed.
            </p>
          </div>
          <Link
            href="/app"
            className="flex h-10 items-center justify-center self-start rounded-full border border-ds-border-strong px-5 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary sm:self-auto"
          >
            ← Back to Dashboard
          </Link>
        </header>

        <TrashList documents={documents} />
      </div>
    </main>
  );
}
