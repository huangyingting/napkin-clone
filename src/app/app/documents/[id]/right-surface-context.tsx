"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import {
  INITIAL_RIGHT_SURFACE_STATE,
  rightSurfaceReducer,
  shouldSuppressFloatPopover,
  type RightSurfaceState,
} from "@/lib/right-surface-coordinator";

type RightSurfaceContextValue = {
  state: RightSurfaceState;
  /** Signal that the SlideEditor panel has opened. */
  openSlideEditor: () => void;
  /** Signal that the SlideEditor panel has closed. */
  closeSlideEditor: () => void;
  /**
   * True when the floating VisualContextPopover must be suppressed because the
   * full-page SlideEditor is currently open. The editor covers the whole screen,
   * so the inline float would be hidden behind it anyway — this flag stops it
   * from rendering while the editor is active.
   */
  suppressFloatPopover: boolean;
};

const RightSurfaceContext = createContext<RightSurfaceContextValue>({
  state: INITIAL_RIGHT_SURFACE_STATE,
  openSlideEditor: () => {},
  closeSlideEditor: () => {},
  suppressFloatPopover: false,
});

/**
 * Provides the right-surface coordinator to all descendant components.
 *
 * Place this at the editor root so that {@link SlideEditorButton} and
 * {@link VisualCard} share the same coordinator instance.
 */
export function RightSurfaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    rightSurfaceReducer,
    INITIAL_RIGHT_SURFACE_STATE,
  );

  const openSlideEditor = useCallback(
    () => dispatch({ type: "OPEN_SLIDE_EDITOR" }),
    [],
  );
  const closeSlideEditor = useCallback(
    () => dispatch({ type: "CLOSE_SLIDE_EDITOR" }),
    [],
  );

  const value = useMemo(
    () => ({
      state,
      openSlideEditor,
      closeSlideEditor,
      suppressFloatPopover: shouldSuppressFloatPopover(state),
    }),
    [state, openSlideEditor, closeSlideEditor],
  );

  return (
    <RightSurfaceContext.Provider value={value}>
      {children}
    </RightSurfaceContext.Provider>
  );
}

export function useRightSurface(): RightSurfaceContextValue {
  return useContext(RightSurfaceContext);
}
