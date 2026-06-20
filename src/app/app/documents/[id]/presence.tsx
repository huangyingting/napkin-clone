"use client";

import { type CollabStatus, type Peer } from "@/lib/collab/use-collaboration";
import { initialsOf } from "@/lib/collab/y-text";

const STATUS_META: Record<
  CollabStatus,
  { label: string; dot: string; text: string }
> = {
  connected: {
    label: "Live",
    dot: "bg-ds-success",
    text: "text-ds-success-text",
  },
  connecting: {
    label: "Connecting…",
    dot: "bg-ds-warning animate-pulse",
    text: "text-ds-warning-text",
  },
  disconnected: {
    label: "Offline",
    dot: "bg-ds-text-muted",
    text: "text-ds-text-muted",
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
                "flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-ds-inverse-text ring-2",
                peer.self ? "ring-ds-control" : "ring-ds-surface-overlay",
              ].join(" ")}
              style={{ backgroundColor: peer.color }}
            >
              {initialsOf(peer.name)}
            </span>
          ))}
          {overflow > 0 ? (
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full bg-ds-surface-sunken text-[10px] font-semibold text-ds-text-secondary ring-2 ring-ds-surface-overlay"
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
