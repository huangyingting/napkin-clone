"use client";

import type { ReactNode } from "react";

export function SlideEditorTopToolbar({
  slideCount,
  tools,
  actions,
}: {
  slideCount: number;
  tools: ReactNode;
  actions: ReactNode;
}) {
  return (
    <header className="flex items-center gap-2 border-b border-ds-border-subtle bg-ds-surface-chrome px-3 py-2 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="truncate text-sm font-semibold text-ds-text-primary">
          Slide editor
        </h2>
        <span className="shrink-0 text-xs text-ds-text-muted">
          {slideCount} {slideCount === 1 ? "slide" : "slides"}
        </span>
      </div>
      {tools}
      {actions}
    </header>
  );
}
