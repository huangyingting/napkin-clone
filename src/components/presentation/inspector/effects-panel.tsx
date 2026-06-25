"use client";

import type { ReactNode } from "react";

export function EffectsInspectorPanel({ children }: { children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id="inspector-panel-effects"
      aria-label="Effects settings"
      className="flex flex-col gap-4"
    >
      {children}
    </div>
  );
}
