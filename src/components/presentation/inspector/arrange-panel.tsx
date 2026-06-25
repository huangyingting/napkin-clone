"use client";

import type { ReactNode } from "react";

export function ArrangePanel({ children }: { children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id="inspector-panel-arrange"
      aria-labelledby="inspector-tab-arrange"
      className="flex flex-col gap-4"
    >
      {children}
    </div>
  );
}
