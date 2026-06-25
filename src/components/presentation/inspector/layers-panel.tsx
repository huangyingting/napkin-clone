"use client";

import type { ReactNode } from "react";

export function LayersPanel({ children }: { children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id="inspector-panel-layers"
      aria-labelledby="inspector-tab-layers"
      className="flex flex-col gap-4"
    >
      {children}
    </div>
  );
}
