---
type: "plan"
status: "verified — no bulk port needed"
last_updated: "2026-07-01"
description: "This document records the feasibility analysis for taking the legacy staging editor's interaction UI and running it on the vNext DeckV7 model and operations. It separates what can be reused unchanged from what must be adapted, and recommends an incremental, parity-driven approach rather than a wholesale copy."
---

# Legacy Stage Interaction Port Plan

This document records the feasibility analysis for taking the legacy staging
editor's interaction UI and running it on the vNext DeckV7 model and operations.
It separates what can be reused unchanged from what must be adapted, and
recommends an incremental, parity-driven approach rather than a wholesale copy.

## Question

Can the legacy staging editor's interaction UI be moved to vNext with the code
left unchanged, wiring it only to the vNext model and operations?

## Verdict

No — a literal "no code changes, only re-point the model/operations" port is not
achievable. The legacy interaction code is written directly against v6 element
shapes, not against an abstraction. However, the majority of the interaction
logic (geometry and render-only concerns) is reusable; the cost is an adapter
layer at the points that read or mutate data.

Note: vNext already ships its own loosely coupled interaction layer, so the real
task is closing feature gaps against legacy parity, not copying legacy code
verbatim.

## Why "unchanged code" is not feasible

Legacy interaction UI reads and writes the v6 element structure directly. These
touch points do not exist in vNext:

| Coupling point   | Legacy (v6)                                                   | vNext (v7)                                                                            |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Grouping         | `element.groupId` (flat array + string property)              | True tree nesting `GroupNode.children`; resolve via `parentGroupIdForNode(nodes, id)` |
| Hit testing      | `hitTestSlideElements(point, elements[])` over a flat array   | Flatten the tree first via `flattenHitNodes(tree)`                                    |
| Drag state       | `DragState.startBox: { x, y, w, h }`                          | Frame is `layout.frame`, plus `zIndex` / `role` / `slot`                              |
| Inline edit test | `element.kind === "text"`                                     | `node.type === "text"`                                                                |
| Operation layer  | `executeCommand(deck, cmd) → CommandResult` (~30 v6 commands) | `editor-commands.ts` pure functions, e.g. `updateNodeLayout(deck, …) → DeckV7`        |

Anywhere the legacy code reads an element, mutates an element, or dispatches a
command, the signatures and field names differ, so a verbatim copy will not
compile.

## What can be reused essentially unchanged

Geometry-only and render-only logic is independent of the data model:

- Drag / resize / rotate math (all `x, y, w, h, rotation` operations).
- Multi-select bounding box and marquee rectangle-intersection.
- Gesture feedback badges, guides, and overlays (render-only).
- Hit-test scoring rules (geometry, independent of storage).

## Existing vNext interaction layer

vNext already implements a loosely coupled, abstracted interaction layer:

| Area             | Source                                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Pointer intents  | [`src/components/presentation-vnext/stage-pointer-interactions.ts`](../../src/components/presentation-vnext/stage-pointer-interactions.ts)     |
| Keyboard         | [`src/components/presentation-vnext/stage-keyboard-interactions.ts`](../../src/components/presentation-vnext/stage-keyboard-interactions.ts)   |
| Connectors       | [`src/components/presentation-vnext/stage-connector-interactions.ts`](../../src/components/presentation-vnext/stage-connector-interactions.ts) |
| Selection model  | [`src/components/presentation-vnext/selection-model.ts`](../../src/components/presentation-vnext/selection-model.ts)                           |
| Gesture feedback | [`src/components/presentation-vnext/stage-gesture-feedback.tsx`](../../src/components/presentation-vnext/stage-gesture-feedback.tsx)           |
| Context menu     | [`src/components/presentation-vnext/stage-context-menu.tsx`](../../src/components/presentation-vnext/stage-context-menu.tsx)                   |
| Targeting        | [`src/components/presentation-vnext/stage-targeting.ts`](../../src/components/presentation-vnext/stage-targeting.ts)                           |
| Editor commands  | [`src/lib/presentation-vnext/editor-commands.ts`](../../src/lib/presentation-vnext/editor-commands.ts)                                         |

## Legacy source, for reference

| Area            | Source                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| Main editor     | [`src/components/presentation/slide-editor.tsx`](../../src/components/presentation/slide-editor.tsx)             |
| Stage editor    | [`src/components/presentation/slide-stage-editor.tsx`](../../src/components/presentation/slide-stage-editor.tsx) |
| Pointer intents | [`src/lib/presentation/stage-interaction.ts`](../../src/lib/presentation/stage-interaction.ts)                   |
| Hit testing     | [`src/lib/presentation/stage-hit-test.ts`](../../src/lib/presentation/stage-hit-test.ts)                         |
| Targeting       | [`src/lib/presentation/stage-targeting.ts`](../../src/lib/presentation/stage-targeting.ts)                       |
| Resize / rotate | [`src/lib/presentation/stage-resize.ts`](../../src/lib/presentation/stage-resize.ts)                             |
| Command layer   | [`src/lib/presentation/slide-commands.ts`](../../src/lib/presentation/slide-commands.ts)                         |

## Recommended approach

Do not attempt a wholesale copy plus a global interface swap. Instead, work
feature by feature:

1. Produce a feature-difference list: interactions the legacy staging editor has
   that vNext still lacks or handles differently.
2. For each interaction to port, keep the geometry / gesture / render code and
   replace only the data access and command dispatch with vNext equivalents:
   - grouping via `parentGroupIdForNode`,
   - mutations via `editor-commands.ts`,
   - fields via `node.type` / `node.layout`.

This keeps risk low, allows incremental verification, and matches the
`AGENTS.md` rule that vNext work starts from legacy parity and compares legacy
behavior before adding new structure.

## Verification (2026-07-01)

An interaction feature comparison was run and then verified directly against the
vNext source. Key finding: **the previously suspected gaps do not exist.** vNext
already implements the interaction features one might expect to port from legacy.
Confirmed present in vNext by reading source:

| Feature                              | vNext location                                                                                                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Align / distribute / match-size      | `arrangement-geometry.ts` (`buildAlignSelectionPatches` / `buildDistributeSelectionPatches` / `buildMatchSizeSelectionPatches`), wired in `slide-editor-vnext.tsx` (~L209–212) and `toolbar/context-toolbar.tsx` (`routeContextToolbarAlign`) |
| Shift + nudge (large step)           | `slide-editor-vnext.tsx` ~L3409 `const nudge = event.shiftKey ? 5 : 1`                                                                                                                                                                        |
| Select-all (Cmd/Ctrl+A)              | `slide-editor-vnext.tsx` ~L3316                                                                                                                                                                                                               |
| Group / ungroup (Cmd/Ctrl+G, +Shift) | `slide-editor-vnext.tsx` ~L3398                                                                                                                                                                                                               |
| Undo / redo                          | `slide-editor-vnext.tsx` ~L3301 (Cmd+Z / Shift / Cmd+Y)                                                                                                                                                                                       |
| Rotate ±15°                          | `toolbar/context-toolbar.tsx` ~L1745–1761                                                                                                                                                                                                     |
| Keyboard connector flow              | `stage-keyboard-interactions.ts` (`nextKeyboardConnectorTargetIdVNext`, anchor cycling)                                                                                                                                                       |
| Clipboard / duplicate / delete       | `slide-editor-vnext.tsx` (clipboard shortcuts, `handleDeleteSelection`)                                                                                                                                                                       |

A machine-generated inventory initially flagged align/distribute/match-size and
shift-nudge as "missing in vNext"; those verdicts were **false** on inspection.
Treat such inventories as leads to verify, not as fact.

### Verified follow-ups (previously open, now closed)

Both remaining questions were checked directly against the vNext source:

- **Rotation snapping while dragging the rotate handle — present.**
  `handleRotationHandlePointerDown` in `slide-editor-vnext.tsx` (~L3138) calls
  `snapRotationDegrees(startRotation + angle - startAngle, !moveEvent.altKey)`;
  it snaps to 15° increments by default and holding Alt disables snapping.
- **Pointer-drag connector creation — UX-affordance difference, not a capability
  gap.** vNext creates connectors by inserting a connector node
  (`handleInsertConnector` → `defaultConnectorNode`) and then dragging its
  endpoints (`handleConnectorEndpointPointerDown`, ~L3153), plus the keyboard
  connector flow. There is no legacy-style single-gesture "drag from source edge
  to target" affordance, but the equivalent capability exists through insert +
  endpoint drag + keyboard.

## Next step

Interaction parity is effectively already met, so a legacy port is not the right
frame. No functional gaps remain. The only genuine divergence is the connector
creation affordance (insert-then-drag vs single-gesture draw); pick it up only if
product wants the one-gesture draw as a UX improvement, scoped as a small vNext
feature rather than a legacy port.
