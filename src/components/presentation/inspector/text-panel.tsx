"use client";

import type { ReactNode } from "react";

export function TextInspectorPanel({ children }: { children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id="inspector-panel-text"
      aria-label="Text settings"
      className="flex flex-col gap-4"
    >
      {children}
    </div>
  );
}
