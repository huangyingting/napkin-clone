"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import {
  GeneratingIndicator,
  VisualSkeleton,
} from "@/components/motion/generation-status";
import { Button, Tooltip, cx } from "@/components/ui";
import { FOCUS_RING } from "@/components/ui/tokens";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import { VISUAL_KIND_META } from "@/lib/lexical/tool-registry";
import type { Visual } from "@/lib/visual/schema";

export type GeneratedCandidatesPanelVariant = "compact" | "popover";

export function GeneratedCandidatesPanel({
  candidates,
  status,
  error,
  creditError = false,
  onRetry,
  onChooseCandidate,
  variant = "popover",
  empty,
}: {
  candidates: Visual[];
  status: "idle" | "loading";
  error: string | null;
  creditError?: boolean;
  onRetry: () => void;
  onChooseCandidate: (candidate: Visual) => void;
  variant?: GeneratedCandidatesPanelVariant;
  empty?: ReactNode;
}) {
  const compact = variant === "compact";
  return (
    <div className={compact ? "mt-2" : "space-y-3 py-1"}>
      {status === "loading" ? (
        <div className={compact ? "space-y-1.5" : "space-y-2"}>
          <ul className={`grid grid-cols-2 ${compact ? "gap-1.5" : "gap-2"}`}>
            {[0, 1].map((i) => (
              <li key={i}>
                <VisualSkeleton />
              </li>
            ))}
          </ul>
          <GeneratingIndicator
            isLoading
            className={
              compact
                ? "px-0.5 py-0 text-xs text-ds-text-muted"
                : "text-xs text-ds-text-muted"
            }
          />
        </div>
      ) : null}

      {error !== null ? (
        <div
          role="alert"
          className={
            compact
              ? "flex flex-col items-start gap-1.5 rounded-ds-md bg-ds-surface-raised px-2 py-2 text-xs text-ds-danger"
              : "flex flex-col gap-2 rounded-ds-md border border-ds-danger/40 bg-ds-danger/10 px-3 py-2 text-xs text-ds-danger"
          }
        >
          <span>{error}</span>
          {creditError ? (
            <Link
              href="/app/settings/billing"
              className={
                compact
                  ? "inline-flex items-center rounded-ds-sm bg-ds-accent px-2 py-1 text-xs font-medium text-ds-text-on-accent transition hover:opacity-90"
                  : "inline-flex self-start rounded-ds-sm bg-ds-accent px-3 py-1.5 text-sm font-medium text-ds-text-on-accent transition hover:opacity-90"
              }
            >
              Upgrade
            </Link>
          ) : (
            <Button
              size="sm"
              variant="subtle"
              className={compact ? undefined : "self-start"}
              onClick={onRetry}
            >
              Try again
            </Button>
          )}
        </div>
      ) : null}

      {candidates.length > 0 ? (
        <div>
          {!compact ? (
            <p className="mb-2 text-[11px] text-ds-text-muted">
              {candidates.length} variation{candidates.length !== 1 ? "s" : ""}{" "}
              — click to apply
            </p>
          ) : null}
          <ul className={`grid grid-cols-2 ${compact ? "gap-1.5" : "gap-2"}`}>
            {candidates.map((candidate, index) => {
              const button = (
                <button
                  type="button"
                  aria-label={
                    compact
                      ? `Insert generated visual ${index + 1}`
                      : `Select variation ${index + 1} of ${candidates.length}`
                  }
                  onClick={() => onChooseCandidate(candidate)}
                  className={cx(
                    compact
                      ? "group flex w-full overflow-hidden rounded-ds-sm border border-ds-border-subtle bg-ds-surface-base p-1 text-left transition-colors hover:border-ds-border-strong"
                      : "group flex w-full flex-col overflow-hidden rounded-ds-md border border-ds-border-subtle bg-ds-surface-base p-1.5 text-left transition hover:border-ds-border-strong",
                    FOCUS_RING,
                  )}
                >
                  <VisualRenderer
                    visual={candidate}
                    className="h-auto w-full"
                  />
                </button>
              );
              return (
                <li key={`${candidate.type}-${index}`}>
                  {compact ? (
                    button
                  ) : (
                    <Tooltip
                      label={
                        candidate.title ??
                        VISUAL_KIND_META[candidate.type].label
                      }
                      side="bottom"
                    >
                      {button}
                    </Tooltip>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {status === "idle" && candidates.length === 0 && error === null
        ? (empty ?? null)
        : null}
    </div>
  );
}
