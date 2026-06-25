"use client";

import type { ReactNode, TransitionEventHandler } from "react";

export function SlideRail({
  open,
  mounted,
  onTransitionEnd,
  children,
}: {
  open: boolean;
  mounted: boolean;
  onTransitionEnd: TransitionEventHandler<HTMLElement>;
  children: ReactNode;
}) {
  return (
    <aside
      aria-hidden={!open}
      onTransitionEnd={onTransitionEnd}
      className={`shrink-0 overflow-hidden bg-ds-surface-sunken transition-[max-height,opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
        open
          ? "max-h-32 translate-y-0 opacity-100"
          : "max-h-0 translate-y-1 opacity-0"
      }`}
    >
      {mounted ? (
        <div
          className={`overflow-x-auto px-2 py-1 transition-opacity duration-150 ${
            open ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {children}
        </div>
      ) : null}
    </aside>
  );
}
