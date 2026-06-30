import assert from "node:assert/strict";
import { test } from "node:test";

import {
  appendPendingPatches,
  clearPendingPatches,
  prependPendingPatches,
} from "./use-slide-editor-commit";
import type { DeckPatch } from "@/lib/presentation/slide-commands";

function patch(op: DeckPatch["op"]): DeckPatch {
  return { schemaVersion: 1, op, slideIds: [], elementIds: [] };
}

test("slide autosave stale failed patch snapshot is restored before newer patches", () => {
  const pendingPatchesRef = {
    current: [patch("slide.update")],
  };
  prependPendingPatches(pendingPatchesRef, [patch("presentation.set_theme")]);

  assert.deepEqual(
    pendingPatchesRef.current.map((item) => item.op),
    ["presentation.set_theme", "slide.update"],
  );
});

test("slide autosave pending patch helpers preserve queued follow-up edits", () => {
  const pendingPatchesRef = { current: [] as DeckPatch[] };
  appendPendingPatches(pendingPatchesRef, [patch("slide.add")]);
  const inFlightSnapshot = [...pendingPatchesRef.current];
  clearPendingPatches(pendingPatchesRef);
  appendPendingPatches(pendingPatchesRef, [patch("slide.update")]);
  prependPendingPatches(pendingPatchesRef, inFlightSnapshot);

  assert.deepEqual(
    pendingPatchesRef.current.map((item) => item.op),
    ["slide.add", "slide.update"],
  );
});
