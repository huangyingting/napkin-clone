"use client";

import { useCallback, useRef } from "react";

import type { Deck } from "@/lib/presentation/deck";
import {
  commitCommand,
  type DeckPatch,
} from "@/lib/presentation/slide-commands";

type DeckChange = (deck: Deck, opts?: { coalesceKey?: string }) => void;
type SlideCommand = Parameters<typeof commitCommand>[1];

export function appendPendingPatches(
  pendingPatchesRef: { current: DeckPatch[] },
  patches: DeckPatch[],
) {
  pendingPatchesRef.current = [...pendingPatchesRef.current, ...patches];
}

export function clearPendingPatches(pendingPatchesRef: {
  current: DeckPatch[];
}) {
  pendingPatchesRef.current = [];
}

export function replacePendingPatches(
  pendingPatchesRef: { current: DeckPatch[] },
  patches: DeckPatch[],
) {
  pendingPatchesRef.current = patches;
}

export function prependPendingPatches(
  pendingPatchesRef: { current: DeckPatch[] },
  patches: DeckPatch[],
) {
  pendingPatchesRef.current = [...patches, ...pendingPatchesRef.current];
}

export function useSlideEditorCommit(onDeckChange: DeckChange) {
  const pendingPatchesRef = useRef<DeckPatch[]>([]);

  const doCommitAndChange = useCallback(
    (deck: Deck, cmd: SlideCommand) => {
      const { result, commitOptions, patches } = commitCommand(deck, cmd);
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, patches);
      onDeckChange(result.deck, commitOptions);
    },
    [onDeckChange],
  );

  return { pendingPatchesRef, doCommitAndChange };
}
