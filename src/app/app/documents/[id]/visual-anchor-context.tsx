"use client";

import { createContext, useContext } from "react";

import type { AnchorNode } from "./comments-panel";

/**
 * Lets an embedded {@link VisualCard} report the visual element the user has
 * selected so the editor chrome can offer it as a comment anchor. The card
 * stores only the visual node's id + label (NOT a Lexical node key), matching
 * the existing `anchorNodeId`/`anchorText` comment-anchor model.
 */
export type VisualAnchorContextValue = {
  setVisualAnchor: (anchor: AnchorNode | null) => void;
};

const VisualAnchorContext = createContext<VisualAnchorContextValue | null>(
  null,
);

export function VisualAnchorProvider({
  value,
  children,
}: {
  value: VisualAnchorContextValue;
  children: React.ReactNode;
}) {
  return (
    <VisualAnchorContext.Provider value={value}>
      {children}
    </VisualAnchorContext.Provider>
  );
}

/** Returns the anchor reporter, or `null` when used outside an editor. */
export function useVisualAnchor(): VisualAnchorContextValue | null {
  return useContext(VisualAnchorContext);
}
