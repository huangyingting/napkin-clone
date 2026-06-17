"use client";

import { type CollabStatus, type Peer } from "@/lib/collab/use-collaboration";
import { initialsOf } from "@/lib/collab/y-text";

const STATUS_META: Record<
  CollabStatus,
  { label: string; dot: string; text: string }
> = {
  connected: {
    label: "Live",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  connecting: {
    label: "Connecting…",
    dot: "bg-amber-500 animate-pulse",
    text: "text-amber-600 dark:text-amber-400",
  },
  disconnected: {
    label: "Offline",
    dot: "bg-zinc-400",
    text: "text-zinc-500 dark:text-zinc-400",
  },
};

const MAX_AVATARS = 4;

/**
 * Shows live collaboration state in the editor header: a connection-status pill
 * and an overlapping stack of presence avatars for everyone currently in the
 * document (the current user marked with a ring).
 */
export function Presence({
  peers,
  status,
}: {
  peers: Peer[];
  status: CollabStatus;
}) {
  const meta = STATUS_META[status];
  const shown = peers.slice(0, MAX_AVATARS);
  const overflow = peers.length - shown.length;

  return (
    <div className="flex items-center gap-3">
      {peers.length > 0 ? (
        <div className="flex items-center -space-x-2" aria-label="People here">
          {shown.map((peer) => (
            <span
              key={peer.clientId}
              title={peer.self ? `${peer.name} (you)` : peer.name}
              aria-label={peer.self ? `${peer.name} (you)` : peer.name}
              className={[
                "flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2",
                peer.self
                  ? "ring-zinc-900 dark:ring-white"
                  : "ring-white dark:ring-zinc-950",
              ].join(" ")}
              style={{ backgroundColor: peer.color }}
            >
              {initialsOf(peer.name)}
            </span>
          ))}
          {overflow > 0 ? (
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-700 ring-2 ring-white dark:bg-zinc-700 dark:text-zinc-100 dark:ring-zinc-950"
              title={`${overflow} more`}
              aria-label={`${overflow} more`}
            >
              +{overflow}
            </span>
          ) : null}
        </div>
      ) : null}
      <span
        className={`flex items-center gap-1.5 text-xs font-medium ${meta.text}`}
        role="status"
        aria-live="polite"
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${meta.dot}`}
        />
        {meta.label}
      </span>
    </div>
  );
}
