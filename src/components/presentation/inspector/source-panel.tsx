"use client";

import type { ReactNode } from "react";

export function SourceInspectorPanel({ children }: { children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id="inspector-panel-source"
      aria-label="Source link settings"
      className="flex flex-col gap-4"
    >
      {children}
    </div>
  );
}
