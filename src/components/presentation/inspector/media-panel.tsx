"use client";

import type { ReactNode } from "react";

export function MediaInspectorPanel({ children }: { children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id="inspector-panel-media"
      aria-label="Media settings"
      className="flex flex-col gap-4"
    >
      {children}
    </div>
  );
}
