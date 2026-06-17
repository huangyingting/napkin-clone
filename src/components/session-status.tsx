"use client";

import { useSession } from "next-auth/react";

export function SessionStatus() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <p className="text-sm text-zinc-500">Checking your session…</p>;
  }

  if (!session?.user) {
    return (
      <p className="text-sm text-zinc-500">
        You are not signed in (client session).
      </p>
    );
  }

  return (
    <p className="text-sm text-zinc-500">
      Signed in as{" "}
      <span className="font-medium text-zinc-700 dark:text-zinc-300">
        {session.user.email}
      </span>{" "}
      (client session).
    </p>
  );
}
