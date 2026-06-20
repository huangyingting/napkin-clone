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
  /** Close callback registered by the currently-open VisualCard. */
  onClose: (() => void) | null;
  /** Selected sub-node id (canvas element) within the active visual. */
  selectedNodeId: string | null;
  /** Register/clear the close callback and selected node id. */
  setOnClose: (cb: (() => void) | null) => void;
  setSelectedNodeId: (id: string | null) => void;
};

const VisualPanelContext = createContext<VisualPanelContextValue>({
  onClose: null,
  selectedNodeId: null,
  setOnClose: () => {},
  setSelectedNodeId: () => {},
});

/**
 * Provides a lightweight bridge between {@link VisualCard} (which owns the
 * per-card open/close state and the currently-selected canvas element) and
 * {@link EditingRail} (which renders the contextual controls at desktop widths).
 *
 * VisualCard pushes its close callback and selected-node id here when its
 * editing controls open; EditingRail reads them to render the panel.
 */
export function VisualPanelProvider({ children }: { children: ReactNode }) {
  const [onClose, setOnCloseState] = useState<(() => void) | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Wrap in () => cb so React does not invoke cb as a lazy state initialiser.
  const setOnClose = useCallback(
    (cb: (() => void) | null) => setOnCloseState(cb === null ? null : () => cb),
    [],
  );

  const value = useMemo(
    () => ({ onClose, selectedNodeId, setOnClose, setSelectedNodeId }),
    [onClose, selectedNodeId, setOnClose],
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
