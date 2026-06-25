"use client";

import type { ReactNode } from "react";

export function SlideInspectorPanel({ children }: { children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id="inspector-panel-slide"
      aria-labelledby="inspector-tab-slide"
      className="flex flex-col gap-4"
    >
      {children}
    </div>
  );
}
