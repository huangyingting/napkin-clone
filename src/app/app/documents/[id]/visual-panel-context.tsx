"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type VisualPanelContextValue = {
  /** Active visual block opened by a VisualCard. */
  activeVisual: { nodeKey: string; visualId: string } | null;
  /** Close callback registered by the currently-open VisualCard. */
  onClose: (() => void) | null;
  /** Selected sub-node id (canvas element) within the active visual. */
  selectedNodeId: string | null;
  /** Register/clear the active visual, close callback, and selected node id. */
  setActiveVisual: (
    active: { nodeKey: string; visualId: string } | null,
  ) => void;
  setOnClose: (cb: (() => void) | null) => void;
  setSelectedNodeId: (id: string | null) => void;
};

const VisualPanelContext = createContext<VisualPanelContextValue>({
  activeVisual: null,
  onClose: null,
  selectedNodeId: null,
  setActiveVisual: () => {},
  setOnClose: () => {},
  setSelectedNodeId: () => {},
});

/**
 * Provides a lightweight bridge between {@link VisualCard} (which owns the
 * per-card open/close state and the currently-selected canvas element) and the
 * shared contextual toolbox surfaces.
 *
 * VisualCard pushes its active visual, close callback, and selected-node id here
 * when its editing controls open; toolbox surfaces read them to render the
 * correct visual/component controls.
 */
export function VisualPanelProvider({ children }: { children: ReactNode }) {
  const [activeVisual, setActiveVisual] = useState<{
    nodeKey: string;
    visualId: string;
  } | null>(null);
  const [onClose, setOnCloseState] = useState<(() => void) | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Wrap in () => cb so React does not invoke cb as a lazy state initialiser.
  const setOnClose = useCallback(
    (cb: (() => void) | null) => setOnCloseState(cb === null ? null : () => cb),
    [],
  );

  const value = useMemo(
    () => ({
      activeVisual,
      onClose,
      selectedNodeId,
      setActiveVisual,
      setOnClose,
      setSelectedNodeId,
    }),
    [activeVisual, onClose, selectedNodeId, setOnClose],
  );

  return (
    <VisualPanelContext.Provider value={value}>
      {children}
    </VisualPanelContext.Provider>
  );
}

export function useVisualPanel(): VisualPanelContextValue {
  return useContext(VisualPanelContext);
}
