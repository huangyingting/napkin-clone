"use client";

import { RefreshCw } from "lucide-react";

import { GeneratingIndicator } from "@/components/motion/generation-status";
import { Button, cx } from "@/components/ui";
import { ExportMenu } from "@/components/visual/export-menu";
import { GeneratedCandidatesPanel } from "@/components/visual/generated-candidates-panel";
import { VISUAL_KIND_META } from "@/lib/lexical/tool-registry";
import { sanitizeFilename } from "@/lib/visual/export-filename";
import { computeVisualInfo } from "@/lib/visual/info";
import type { Visual } from "@/lib/visual/schema";

export function VisualExportPanel({
  visual,
  getSvgElement,
}: {
  visual: Visual;
  getSvgElement: () => SVGSVGElement | null;
}) {
  return (
    <div className="space-y-3 py-1">
      <p className="text-[11px] text-[var(--ds-text-muted,#6f7d83)]">
        Export this visual as PNG, SVG, or PowerPoint.
      </p>
      <ExportMenu
        getSvgElement={getSvgElement}
        getVisual={() => visual}
        filename={sanitizeFilename(visual.title ?? "")}
      />
    </div>
  );
}

export function VisualSyncPanel({
  visual,
  currentSourceText,
  stale,
  syncStatus,
  syncError,
  onSync,
}: {
  visual: Visual;
  currentSourceText?: string;
  stale: boolean;
  syncStatus: "idle" | "loading";
  syncError: string | null;
  onSync: () => void;
}) {
  const hasSource = !!(visual.sourceText ?? currentSourceText);
  return (
    <div className="space-y-3 py-1">
      {stale ? (
        <div className="flex items-center gap-2 rounded-[var(--ds-radius-md,10px)] bg-ds-warning-surface px-3 py-2 text-[11px] text-ds-warning-text">
          <span
            className="inline-flex h-2 w-2 flex-shrink-0 rounded-full bg-ds-warning"
            aria-hidden="true"
          />
          Source text has changed since this visual was generated.
        </div>
      ) : null}
      {!hasSource ? (
        <p className="text-[11px] text-[var(--ds-text-muted,#6f7d83)]">
          No source text is associated with this visual. Attach it to a
          paragraph to enable sync.
        </p>
      ) : null}
      {syncStatus === "loading" ? (
        <GeneratingIndicator
          isLoading
          className="text-xs text-[var(--ds-text-muted,#6f7d83)]"
        />
      ) : null}
      {syncError !== null ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-[var(--ds-radius-md,10px)] border border-[var(--ds-danger,#dc2626)]/40 bg-[var(--ds-danger,#dc2626)]/10 px-3 py-2 text-xs text-[var(--ds-danger,#b91c1c)]"
        >
          <span>{syncError}</span>
          <Button
            size="sm"
            variant="subtle"
            className="self-start"
            onClick={onSync}
          >
            Try again
          </Button>
        </div>
      ) : null}
      <Button
        size="sm"
        variant="subtle"
        onClick={onSync}
        disabled={syncStatus === "loading" || !hasSource}
      >
        <RefreshCw
          aria-hidden="true"
          className={cx(
            "mr-1.5 h-3.5 w-3.5",
            syncStatus === "loading" ? "animate-spin" : "",
          )}
        />
        Sync to text
      </Button>
    </div>
  );
}

export function VisualInfoPanel({
  visual,
  stale,
}: {
  visual: Visual;
  stale: boolean;
}) {
  const info = computeVisualInfo(visual);
  const kindMeta = VISUAL_KIND_META[info.kind];
  return (
    <dl className="space-y-2.5 py-1 text-xs">
      <div className="flex justify-between gap-2">
        <dt className="text-[var(--ds-text-muted,#6f7d83)]">Type</dt>
        <dd className="font-medium text-[var(--ds-text-primary,#15171a)]">
          {kindMeta.label}
        </dd>
      </div>
      <div className="flex justify-between gap-2">
        <dt className="text-[var(--ds-text-muted,#6f7d83)]">Nodes</dt>
        <dd className="font-medium text-[var(--ds-text-primary,#15171a)] tabular-nums">
          {info.nodeCount}
        </dd>
      </div>
      <div className="flex justify-between gap-2">
        <dt className="text-[var(--ds-text-muted,#6f7d83)]">Edges</dt>
        <dd className="font-medium text-[var(--ds-text-primary,#15171a)] tabular-nums">
          {info.edgeCount}
        </dd>
      </div>
      {info.effectCount > 0 ? (
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--ds-text-muted,#6f7d83)]">Effects</dt>
          <dd className="font-medium text-[var(--ds-text-primary,#15171a)] tabular-nums">
            {info.effectCount}
          </dd>
        </div>
      ) : null}
      {info.title ? (
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--ds-text-muted,#6f7d83)]">Title</dt>
          <dd className="max-w-[160px] truncate font-medium text-[var(--ds-text-primary,#15171a)]">
            {info.title}
          </dd>
        </div>
      ) : null}
      {info.sourceText ? (
        <div className="flex flex-col gap-1">
          <dt className="text-[var(--ds-text-muted,#6f7d83)]">Source text</dt>
          <dd className="line-clamp-3 rounded-[var(--ds-radius-sm,8px)] bg-[var(--ds-surface-sunken,#f5f5f5)] px-2 py-1.5 text-[11px] text-[var(--ds-text-primary,#15171a)]">
            {info.sourceText}
          </dd>
        </div>
      ) : null}
      <div className="flex justify-between gap-2">
        <dt className="text-[var(--ds-text-muted,#6f7d83)]">Font family</dt>
        <dd className="max-w-[160px] truncate font-medium text-[var(--ds-text-primary,#15171a)]">
          {info.fontFamily.split(",")[0].replace(/['"]/g, "").trim() ||
            "System default"}
        </dd>
      </div>
      {stale ? (
        <div className="flex items-center gap-1.5 text-ds-warning-text">
          <span
            className="inline-flex h-2 w-2 flex-shrink-0 rounded-full bg-ds-warning"
            aria-hidden="true"
          />
          <span className="text-[10px]">Source text has changed</span>
        </div>
      ) : null}
    </dl>
  );
}

export function VisualVariationsPanel({
  candidates,
  genStatus,
  genError,
  creditError,
  onGenerate,
  onChooseCandidate,
}: {
  candidates: Visual[];
  genStatus: "idle" | "loading";
  genError: string | null;
  creditError?: boolean;
  onGenerate: () => void;
  onChooseCandidate: (candidate: Visual) => void;
}) {
  return (
    <GeneratedCandidatesPanel
      candidates={candidates}
      status={genStatus}
      error={genError}
      creditError={creditError}
      onRetry={onGenerate}
      onChooseCandidate={onChooseCandidate}
      empty={
        <p className="text-[11px] text-[var(--ds-text-muted,#6f7d83)]">
          Use the AI button in the toolbar to generate variations.
        </p>
      }
    />
  );
}
