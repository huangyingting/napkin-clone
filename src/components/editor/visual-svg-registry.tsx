"use client";

/**
 * Registry that lets every `VisualCard` in the document register its live
 * SVG element so the document-level export can collect all visuals without
 * DOM traversal.
 *
 * Usage:
 *   – Wrap the editor tree with `<VisualSvgRegistryProvider>`.
 *   – Each `VisualCard` calls `useRegisterVisualSvg(visualId, getSvg)`.
 *   – The export button calls `useVisualSvgRegistry()` to get the Map.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

type SvgGetter = () => SVGSVGElement | null;
type Registry = Map<string, SvgGetter>;

const VisualSvgRegistryContext = createContext<Registry | null>(null);

export function VisualSvgRegistryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // A stable Map instance for the lifetime of the editor.
  const registry = useMemo<Registry>(() => new Map(), []);
  return (
    <VisualSvgRegistryContext.Provider value={registry}>
      {children}
    </VisualSvgRegistryContext.Provider>
  );
}

/**
 * Returns the registry Map for reading (used by the export button).
 * Returns `null` when rendered outside a `VisualSvgRegistryProvider`.
 */
export function useVisualSvgRegistry(): Registry | null {
  return useContext(VisualSvgRegistryContext);
}

/**
 * Registers a `getSvg` callback for the given `visualId` for the lifetime of
 * the calling component. Safe to call conditionally — mount/unmount lifecycle
 * is handled by the effect.
 */
export function useRegisterVisualSvg(
  visualId: string,
  getSvg: SvgGetter,
): void {
  const registry = useContext(VisualSvgRegistryContext);
  // Keep the callback reference stable across renders so the effect
  // dependency array doesn't trigger unnecessary re-registrations.
  const getSvgRef = useRef<SvgGetter>(getSvg);
  useEffect(() => {
    getSvgRef.current = getSvg;
  });

  const stableGetter = useCallback(() => getSvgRef.current(), []);

  useEffect(() => {
    if (!registry) return;
    registry.set(visualId, stableGetter);
    return () => {
      registry.delete(visualId);
    };
  }, [registry, visualId, stableGetter]);
}
