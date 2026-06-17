import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

import { CreateWorkspaceButton } from "./create-workspace-button";

export const metadata: Metadata = {
  title: "Workspaces — Napkin Clone",
};

const primaryButtonClass =
  "flex h-10 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200";

export default async function WorkspacesPage() {
  const user = await requireUser();

  // Get workspaces where the user is owner or member
  const ownedWorkspaces = await prisma.workspace.findMany({
    where: { ownerId: user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      updatedAt: true,
      _count: { select: { members: true, documents: true } },
    },
  });

  const memberWorkspaces = await prisma.workspace.findMany({
    where: {
      members: {
        some: {
          userId: user.id,
        },
      },
      ownerId: { not: user.id },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      updatedAt: true,
      _count: { select: { members: true, documents: true } },
      members: {
        where: { userId: user.id },
        select: { role: true },
      },
    },
  });

  const allWorkspaces = [
    ...ownedWorkspaces.map((w) => ({ ...w, userRole: "OWNER" as const })),
    ...memberWorkspaces.map((w) => ({
      ...w,
      userRole: w.members[0]?.role || ("VIEWER" as const),
      members: undefined,
    })),
  ];

  return (
    <main className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <div className="flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Workspaces
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Shared spaces for team collaboration
            </p>
          </div>
          <CreateWorkspaceButton className={primaryButtonClass} />
        </header>

        {allWorkspaces.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center dark:border-white/15 dark:bg-zinc-950">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
                No workspaces yet
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Create a workspace to collaborate with your team.
              </p>
            </div>
            <CreateWorkspaceButton className={primaryButtonClass}>
              Create your first workspace
            </CreateWorkspaceButton>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allWorkspaces.map((workspace) => (
              <li key={workspace.id}>
                <Link
                  href={`/app/workspaces/${workspace.id}`}
                  className="group flex flex-col rounded-xl border border-black/[.06] bg-white p-6 transition hover:border-black/15 hover:shadow-sm dark:border-white/[.08] dark:bg-zinc-950 dark:hover:border-white/20"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <h3 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
                        {workspace.name}
                      </h3>
                      <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {workspace.userRole}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <div>
                        {workspace._count.members + 1} member
                        {workspace._count.members + 1 !== 1 ? "s" : ""}
                      </div>
                      <div>
                        {workspace._count.documents} document
                        {workspace._count.documents !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
