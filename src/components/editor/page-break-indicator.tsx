"use client";

import { useEffect, useRef, useState } from "react";

import {
  computePageBreaks,
  PAGE_SIZE_DIMENSIONS,
  type PageSize,
} from "@/lib/content";

interface PageBreakIndicatorProps {
  /** The element whose scrollHeight drives page-break computation. */
  contentRef: React.RefObject<HTMLElement | null>;
  /** Which page size to paginate against. */
  pageSize: PageSize;
}

/**
 * Renders absolutely-positioned horizontal rule indicators at the positions
 * where pages would split for the chosen page size. Mount this inside a
 * `relative`-positioned container that also contains the content element.
 *
 * The indicator re-measures automatically on resize (via ResizeObserver) so
 * it stays accurate as the user types.
 */
export function PageBreakIndicator({
  contentRef,
  pageSize,
}: PageBreakIndicatorProps) {
  const [breaks, setBreaks] = useState<number[]>([]);
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const measure = () => {
      const h = el.scrollHeight;
      setBreaks(computePageBreaks(h, pageSize));
    };

    measure();

    observerRef.current = new ResizeObserver(measure);
    observerRef.current.observe(el);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [contentRef, pageSize]);

  if (breaks.length === 0) return null;

  const { widthPx } = PAGE_SIZE_DIMENSIONS[pageSize];
  // Scale the label to show the actual page size name
  const label = pageSize === "16:9" ? "16:9 slide" : pageSize.toUpperCase();

  return (
    <>
      {breaks.map((offset) => (
        <div
          key={offset}
          aria-hidden="true"
          style={{ top: offset }}
          className="pointer-events-none absolute inset-x-0 z-raised flex items-center gap-2"
        >
          <div className="h-px flex-1 border-t border-dashed border-[var(--ds-border-subtle,rgba(0,0,0,0.15))]" />
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--ds-text-muted,#6f7d83)]"
            style={{ opacity: 0.7 }}
          >
            {label} · {widthPx}px
          </span>
          <div className="h-px flex-1 border-t border-dashed border-[var(--ds-border-subtle,rgba(0,0,0,0.15))]" />
        </div>
      ))}
    </>
  );
}
