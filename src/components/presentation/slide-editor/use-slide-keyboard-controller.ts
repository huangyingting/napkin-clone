"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type {
  Deck,
  ConnectorElement,
  ElementBox,
  SlideElement,
} from "@/lib/presentation/deck";
import {
  announceDelete,
  announceMove,
  announceResize,
  announceSelection,
  buildConnectorBetween,
  connectorBoundingBox,
  cycleEndpointAnchor,
  focusTargetAfterDelete,
  isArrowKey,
  isConnectableElement,
  nextElementId,
  orderedElementIds,
  resizeBoxByStep,
  selectedConnectablePair,
} from "@/lib/presentation/canvas-a11y";
import {
  keyboardConnectorDecision,
  startKeyboardConnectorMode,
  type KeyboardConnectorMode,
} from "@/lib/presentation/canvas-keyboard-connector";
import {
  announceRotation,
  applyKeyboardRotation,
  keyboardRotationDelta,
} from "@/lib/presentation-shared/canvas-keyboard-rotate";
import { resolveConnectorElementPoints } from "@/lib/presentation/connector-geometry";
import { elementAccessibleName } from "@/lib/presentation/element-accessible-name";
import {
  duplicateElements,
  type ElementPatch,
} from "@/lib/presentation/deck-mutations";
import { makeElementId } from "@/lib/presentation/deck";
import {
  rotateElementsAroundCenter,
  selectionBoundingBox,
} from "@/lib/presentation/selection-transform";
import {
  commitCommand,
  type DeckPatch,
} from "@/lib/presentation/slide-commands";
import {
  appendPendingPatches,
  clearPendingPatches,
} from "@/components/presentation/slide-editor/use-slide-editor-commit";

type DeckCommit = (deck: Deck, opts?: { coalesceKey?: string }) => void;

interface SlideEditorKeyboardControllerOptions {
  deck: Deck;
  safeSelected: number;
  effectiveSelectedElementId: string | null;
  effectiveSelectedElementIds: ReadonlySet<string>;
  inspectorSheetOpen: boolean;
  setInspectorSheetOpen: (open: boolean) => void;
  setSelectedElementId: (
    id: string | null | ((current: string | null) => string | null),
  ) => void;
  setSelectedElementIds: (
    ids: Set<string> | ((current: Set<string>) => Set<string>),
  ) => void;
  setSelectedIndex: (value: number | ((current: number) => number)) => void;
  clearSelection: () => void;
  copyElementsToClipboard: (
    deck: Deck,
    slideIndex: number,
    ids: string[],
  ) => boolean;
  pasteClipboardElements: (
    deck: Deck,
    slideIndex: number,
  ) => { deck: Deck; newIds: string[] } | null;
  pendingPatchesRef: { current: DeckPatch[] };
  onDeckChange: DeckCommit;
  doCommitAndChange: (
    deck: Deck,
    command: Parameters<typeof commitCommand>[1],
  ) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleRequestClose: () => void;
}

export function useSlideEditorKeyboardController({
  deck,
  safeSelected,
  effectiveSelectedElementId,
  effectiveSelectedElementIds,
  inspectorSheetOpen,
  setInspectorSheetOpen,
  setSelectedElementId,
  setSelectedElementIds,
  setSelectedIndex,
  clearSelection,
  copyElementsToClipboard,
  pasteClipboardElements,
  pendingPatchesRef,
  onDeckChange,
  doCommitAndChange,
  handleUndo,
  handleRedo,
  handleRequestClose,
}: SlideEditorKeyboardControllerOptions) {
  const keydownStateRef = useRef({
    deck,
    safeSelected: 0,
    effectiveSelectedElementId: null as string | null,
    effectiveSelectedElementIds: new Set<string>(),
    keyboardConnectorMode: null as KeyboardConnectorMode | null,
  });
  const focusNonceRef = useRef(0);
  const [focusRequest, setFocusRequest] = useState<{
    elementId: string | null;
    nonce: number;
  }>({ elementId: null, nonce: 0 });
  const requestElementFocus = useCallback((elementId: string | null) => {
    focusNonceRef.current += 1;
    setFocusRequest({ elementId, nonce: focusNonceRef.current });
  }, []);
  const liveNonceRef = useRef(0);
  const [liveMessage, setLiveMessage] = useState<{
    text: string;
    nonce: number;
  }>({ text: "", nonce: 0 });
  const announce = useCallback((text: string) => {
    liveNonceRef.current += 1;
    setLiveMessage({ text, nonce: liveNonceRef.current });
  }, []);
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);
  const [keyboardConnectorMode, setKeyboardConnectorMode] =
    useState<KeyboardConnectorMode | null>(null);

  // A selection is only valid while its element exists on the active slide; the
  // selection hook prunes stale ids whenever slides switch or elements disappear.
  // Keep the keydown state ref current after every render so the single-subscribed
  // listener always reads the latest deck and selection without re-subscribing.
  // useLayoutEffect runs synchronously after DOM updates (before paint) so the ref
  // is fresh before any user interaction can trigger the keydown handler.
  useLayoutEffect(() => {
    keydownStateRef.current = {
      deck,
      safeSelected,
      effectiveSelectedElementId,
      effectiveSelectedElementIds: new Set(effectiveSelectedElementIds),
      keyboardConnectorMode,
    };
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      // Read volatile state from the ref so this handler never needs to
      // re-subscribe when deck identity or selection changes (e.g. during a
      // drag that fires 60 commits/s). The ref is updated on every render.
      const {
        deck: kDeck,
        safeSelected: kSafe,
        effectiveSelectedElementId: kElemId,
        effectiveSelectedElementIds: kElemIds,
        keyboardConnectorMode: kConnectorMode,
      } = keydownStateRef.current;

      if (kConnectorMode) {
        const modeSlide = kDeck.slides[kSafe];
        const modeSlideId = modeSlide?.id;
        const modeElements = modeSlide?.elements ?? [];
        const connectableElements = modeElements.filter(isConnectableElement);
        const source = modeElements.find(
          (element) => element.id === kConnectorMode.sourceId,
        );
        if (!modeSlideId || !source || !isConnectableElement(source)) {
          setKeyboardConnectorMode(null);
          return;
        }
        const decision = keyboardConnectorDecision(
          kConnectorMode,
          { key: event.key, shiftKey: event.shiftKey },
          connectableElements,
        );
        if (decision.type !== "none") {
          event.preventDefault();
        }
        if (decision.type === "cancel") {
          setKeyboardConnectorMode(null);
          setSelectedElementId(decision.sourceId);
          setSelectedElementIds(new Set([decision.sourceId]));
          requestElementFocus(decision.sourceId);
          announce("Connector mode canceled");
          return;
        }
        if (decision.type === "target") {
          const targetId = decision.mode.targetId;
          if (!targetId) {
            return;
          }
          setKeyboardConnectorMode(decision.mode);
          setSelectedElementId(targetId);
          setSelectedElementIds(new Set([decision.mode.sourceId, targetId]));
          requestElementFocus(targetId);
          const targetElement = modeElements.find(
            (element) => element.id === targetId,
          );
          if (targetElement) {
            announce(
              `Connector target ${elementAccessibleName(
                targetElement,
                modeElements,
              )}. Press Enter to connect.`,
            );
          }
          return;
        }
        if (decision.type === "confirm") {
          const targetElement = modeElements.find(
            (element) => element.id === decision.targetId,
          );
          if (!targetElement || !isConnectableElement(targetElement)) {
            setKeyboardConnectorMode(null);
            return;
          }
          const newId = makeElementId();
          doCommitAndChange(kDeck, {
            type: "ADD_ELEMENT",
            slideId: modeSlideId,
            element: {
              ...buildConnectorBetween(source, targetElement),
              id: newId,
            },
          });
          setKeyboardConnectorMode(null);
          setSelectedElementId(newId);
          setSelectedElementIds(new Set([newId]));
          requestElementFocus(newId);
          announce(
            `Connected ${elementAccessibleName(
              source,
              modeElements,
            )} to ${elementAccessibleName(targetElement, modeElements)}`,
          );
          return;
        }
      }

      if (event.key === "Escape") {
        event.preventDefault();
        if (keyboardHelpOpen) {
          setKeyboardHelpOpen(false);
        } else if (inspectorSheetOpen) {
          setInspectorSheetOpen(false);
        } else if (kElemId) {
          clearSelection();
          // Release canvas focus to the stage container so Tab can leave the
          // canvas — keyboard users are never trapped among elements (#531).
          requestElementFocus(null);
        } else {
          handleRequestClose();
        }
        return;
      }

      if (typing) {
        return;
      }

      // Open the in-product keyboard shortcut help (#535). `?` is Shift+/; the
      // `typing` guard above keeps it from firing while editing a field.
      if (event.key === "?") {
        event.preventDefault();
        setKeyboardHelpOpen(true);
        return;
      }

      // Tab / Shift+Tab cycle the selection among canvas elements in reading
      // order while a canvas element has focus (#531). Only intercepted when
      // focus is on an element; Tab from the bare stage container (e.g. after
      // Escape) falls through to native order so the canvas is never a trap.
      if (event.key === "Tab" && target?.closest("[data-element-id]")) {
        const tabSlide = kDeck.slides[kSafe];
        const ordered = orderedElementIds(tabSlide?.elements ?? []);
        if (ordered.length > 0) {
          event.preventDefault();
          const nextId = nextElementId(
            ordered,
            kElemId,
            event.shiftKey ? -1 : 1,
          );
          setSelectedElementId(nextId);
          setSelectedElementIds(nextId ? new Set([nextId]) : new Set());
          requestElementFocus(nextId);
          const nextEl = nextId
            ? tabSlide?.elements?.find((el) => el.id === nextId)
            : undefined;
          if (nextEl) {
            announce(
              announceSelection(
                elementAccessibleName(nextEl, tabSlide?.elements),
              ),
            );
          }
          return;
        }
      }

      // Undo / redo over deck history. Ctrl/⌘+Z = undo,
      // Ctrl/⌘+Shift+Z (or Ctrl+Y) = redo. The `typing` guard above keeps
      // these from hijacking field-level undo while editing text.
      const mod = event.metaKey || event.ctrlKey;
      if (mod && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if (mod && !event.shiftKey && (event.key === "y" || event.key === "Y")) {
        event.preventDefault();
        handleRedo();
        return;
      }

      // Slide-management shortcuts (mod = Ctrl/⌘). The `typing` guard above keeps
      // these from firing while editing a field, and they all require the
      // modifier so they never collide with the element Delete/Backspace or the
      // bare ArrowLeft/Right paging below. Each routes through the same handlers
      // as the rail buttons, so every action lands on the undo/redo `commit`.
      if (mod && !event.shiftKey && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "d") {
          event.preventDefault();
          // Element-duplicate takes precedence when an element is selected;
          // otherwise fall back to slide-duplicate (#212). Duplicates the whole
          // multi-selection (offset copies) and selects them (#245). Inlined
          // (not via `handleDuplicateElement`) so this effect needs no extra dep
          // and avoids a temporal-dead-zone with handlers declared further down.
          if (kElemId) {
            const ids = kElemIds.size > 0 ? [...kElemIds] : [kElemId];
            const { deck: nextDeck, newElementIds } = duplicateElements(
              kDeck,
              kSafe,
              ids,
            );
            if (newElementIds.length > 0) {
              clearPendingPatches(pendingPatchesRef);
              onDeckChange(nextDeck);
              setSelectedElementId(newElementIds[0]);
              setSelectedElementIds(new Set(newElementIds));
              // Keep focus on the new copy (#532) and announce it (#533).
              requestElementFocus(newElementIds[0]);
              const dupEl = nextDeck.slides[kSafe]?.elements?.find(
                (el) => el.id === newElementIds[0],
              );
              if (dupEl) {
                announce(
                  announceSelection(
                    elementAccessibleName(
                      dupEl,
                      nextDeck.slides[kSafe]?.elements,
                    ),
                  ),
                );
              }
            }
          } else {
            const slideId = kDeck.slides[kSafe]?.id;
            if (slideId) {
              const { result, commitOptions, patches } = commitCommand(kDeck, {
                type: "DUPLICATE_SLIDE",
                slideId,
              });
              if (result.ok) {
                appendPendingPatches(pendingPatchesRef, patches);
                onDeckChange(result.deck, commitOptions);
                setSelectedIndex(kSafe + 1);
              }
            }
          }
          return;
        }
        if (key === "n") {
          event.preventDefault();
          const afterSlideId = kDeck.slides[kSafe]?.id ?? null;
          const { result, commitOptions, patches } = commitCommand(kDeck, {
            type: "ADD_SLIDE",
            afterSlideId,
          });
          if (result.ok) {
            appendPendingPatches(pendingPatchesRef, patches);
            onDeckChange(result.deck, commitOptions);
            setSelectedIndex(
              Math.min(kSafe + 1, result.deck.slides.length - 1),
            );
          }
          return;
        }
        // Element clipboard + select-all. Operate on the current slide's
        // elements; all route through pure mutations so they are single undo
        // steps, and paste works across slides via the shared clipboard ref.
        const slideEls = kDeck.slides[kSafe]?.elements ?? [];
        if (key === "a") {
          if (slideEls.length > 0) {
            event.preventDefault();
            setSelectedElementId(slideEls[slideEls.length - 1].id);
            setSelectedElementIds(new Set(slideEls.map((el) => el.id)));
          }
          return;
        }
        if (key === "c" || key === "x") {
          if (kElemId) {
            event.preventDefault();
            const ids = kElemIds.size > 0 ? [...kElemIds] : [kElemId];
            if (copyElementsToClipboard(kDeck, kSafe, ids)) {
              if (key === "x") {
                const slideId = kDeck.slides[kSafe]?.id;
                if (slideId) {
                  doCommitAndChange(kDeck, {
                    type: "REMOVE_ELEMENTS",
                    slideId,
                    elementIds: ids,
                  });
                  clearSelection();
                }
              }
            }
          }
          return;
        }
        if (key === "v") {
          const pasted = pasteClipboardElements(kDeck, kSafe);
          if (pasted) {
            event.preventDefault();
            clearPendingPatches(pendingPatchesRef);
            onDeckChange(pasted.deck);
            setSelectedElementId(pasted.newIds[0] ?? null);
            setSelectedElementIds(new Set(pasted.newIds));
          }
          return;
        }
        if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          const slideId = kDeck.slides[kSafe]?.id;
          if (slideId) {
            const { result, commitOptions, patches } = commitCommand(kDeck, {
              type: "REMOVE_SLIDE",
              slideId,
            });
            if (result.ok) {
              appendPendingPatches(pendingPatchesRef, patches);
              onDeckChange(result.deck, commitOptions);
              setSelectedIndex((current) =>
                Math.max(0, Math.min(current, kDeck.slides.length - 2)),
              );
            }
          }
          return;
        }
      }

      // Group (Ctrl/⌘+G) and Ungroup (Ctrl/⌘+Shift+G) shortcuts (issue #330).
      if (mod && !event.altKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        const ids =
          kElemIds.size > 0 ? [...kElemIds] : kElemId ? [kElemId] : [];
        const slideId = kDeck.slides[kSafe]?.id;
        if (!slideId) {
          return;
        }
        if (event.shiftKey) {
          // Ungroup: clear groupId from every distinct group among the selected elements.
          const slideEls = kDeck.slides[kSafe]?.elements ?? [];
          const selectedEls = slideEls.filter((el) => ids.includes(el.id));
          const gids = new Set(
            selectedEls
              .map((el) => (el as { groupId?: string }).groupId)
              .filter((g): g is string => !!g),
          );
          if (gids.size > 0) {
            let nextDeck = kDeck;
            const patches: DeckPatch[] = [];
            for (const gid of gids) {
              const committed = commitCommand(nextDeck, {
                type: "UNGROUP_ELEMENTS",
                slideId,
                groupId: gid,
              });
              if (!committed.result.ok) {
                continue;
              }
              nextDeck = committed.result.deck;
              patches.push(...committed.patches);
            }
            if (nextDeck !== kDeck) {
              appendPendingPatches(pendingPatchesRef, patches);
              onDeckChange(nextDeck);
            }
          }
        } else if (ids.length >= 2) {
          doCommitAndChange(kDeck, {
            type: "GROUP_ELEMENTS",
            slideId,
            elementIds: ids,
          });
          // Keep focus on the group's primary element (#532).
          requestElementFocus(ids[0]);
        }
        return;
      }

      // Connector keyboard authoring (#534, #930). Bare `c`:
      //  - one connector selected → cycle its END endpoint anchor among the
      //    candidate anchors (Shift+C cycles the START endpoint),
      //  - exactly two connectable elements selected → insert a connector with
      //    default endpoints bound to both, then select + focus it,
      //  - one connectable element selected → enter connector mode; Tab/arrows
      //    preview nearby targets, Enter creates, Escape cancels.
      if (!mod && !event.altKey && (event.key === "c" || event.key === "C")) {
        const connSlide = kDeck.slides[kSafe];
        const connSlideId = connSlide?.id;
        const connElements = connSlide?.elements ?? [];
        if (!connSlideId) {
          return;
        }
        const selectedConnector =
          kElemId && kElemIds.size <= 1
            ? connElements.find(
                (el): el is ConnectorElement =>
                  el.id === kElemId && el.kind === "connector",
              )
            : undefined;
        if (selectedConnector) {
          event.preventDefault();
          const whichEnd = event.shiftKey ? "start" : "end";
          const updated = cycleEndpointAnchor(selectedConnector, whichEnd, 1);
          if (updated !== selectedConnector) {
            // Recompute the connector's box from the resolved endpoints so its
            // selection bounds / handles track the new anchor.
            const pts = resolveConnectorElementPoints(
              updated,
              connElements,
              (el) => el.box,
            );
            const nextBox = connectorBoundingBox(pts.start, pts.end);
            doCommitAndChange(kDeck, {
              type: "UPDATE_ELEMENT",
              slideId: connSlideId,
              elementId: selectedConnector.id,
              patch:
                whichEnd === "start"
                  ? {
                      content: {
                        ...updated.content,
                        start: updated.content.start,
                      },
                      box: nextBox,
                    }
                  : {
                      content: { ...updated.content, end: updated.content.end },
                      box: nextBox,
                    },
            });
            requestElementFocus(selectedConnector.id);
            const endpoint = updated.content[whichEnd];
            const anchorLabel =
              "anchor" in endpoint ? endpoint.anchor : "anchor";
            announce(
              `Reattached connector ${whichEnd} endpoint to ${anchorLabel}`,
            );
          }
          return;
        }
        const pair = selectedConnectablePair(connElements, kElemIds);
        if (pair) {
          event.preventDefault();
          const newId = makeElementId();
          doCommitAndChange(kDeck, {
            type: "ADD_ELEMENT",
            slideId: connSlideId,
            element: { ...buildConnectorBetween(pair[0], pair[1]), id: newId },
          });
          setSelectedElementId(newId);
          setSelectedElementIds(new Set([newId]));
          requestElementFocus(newId);
          announce(
            `Connected ${elementAccessibleName(
              pair[0],
              connElements,
            )} to ${elementAccessibleName(pair[1], connElements)}`,
          );
          return;
        }
        const connectorSource =
          kElemId && kElemIds.size <= 1
            ? connElements.find((el) => el.id === kElemId)
            : undefined;
        if (connectorSource && isConnectableElement(connectorSource)) {
          event.preventDefault();
          const mode = startKeyboardConnectorMode(
            connElements.filter(isConnectableElement),
            connectorSource.id,
          );
          if (!mode?.targetId) {
            announce("No connector targets available");
            return;
          }
          setKeyboardConnectorMode(mode);
          setSelectedElementId(mode.targetId);
          setSelectedElementIds(new Set([connectorSource.id, mode.targetId]));
          requestElementFocus(mode.targetId);
          const targetElement = connElements.find(
            (el) => el.id === mode.targetId,
          );
          announce(
            targetElement
              ? `Connector target ${elementAccessibleName(
                  targetElement,
                  connElements,
                )}. Press Enter to connect.`
              : "Connector mode started",
          );
          return;
        }
      }

      // With an element selected, arrow keys nudge it and Delete removes it.
      const slide = kDeck.slides[kSafe];
      const selected =
        kElemId && slide?.elements
          ? slide.elements.find((el) => el.id === kElemId)
          : undefined;

      if (selected) {
        // Apply Delete and arrow-nudge to the whole multi-selection (#245),
        // falling back to the primary alone when the set is somehow empty. A
        // multi-delete / multi-nudge routes through one pure mutation so it is a
        // single undo step.
        const selectedIds = kElemIds.size > 0 ? [...kElemIds] : [selected.id];
        const slideId = kDeck.slides[kSafe]?.id;
        if (!slideId) {
          return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          const ordered = orderedElementIds(slide?.elements ?? []);
          const focusTarget = focusTargetAfterDelete(
            ordered,
            new Set(selectedIds),
          );
          const deletedName =
            selectedIds.length > 1
              ? `${selectedIds.length} elements`
              : elementAccessibleName(selected, slide?.elements);
          doCommitAndChange(kDeck, {
            type: "REMOVE_ELEMENTS",
            slideId,
            elementIds: selectedIds,
          });
          setSelectedElementId(focusTarget);
          setSelectedElementIds(
            focusTarget ? new Set([focusTarget]) : new Set(),
          );
          requestElementFocus(focusTarget);
          announce(announceDelete(deletedName));
          return;
        }

        const rotationDelta = keyboardRotationDelta(event);
        if (rotationDelta !== null) {
          event.preventDefault();
          const transformableElements = selectedIds
            .map((id) => slide?.elements?.find((el) => el.id === id))
            .filter((el): el is SlideElement => el !== undefined && !el.locked);
          if (transformableElements.length === 0) {
            return;
          }
          if (transformableElements.length === 1) {
            const [rotating] = transformableElements;
            const nextRotation = applyKeyboardRotation(
              rotating.rotation,
              rotationDelta,
            );
            doCommitAndChange(kDeck, {
              type: "UPDATE_ELEMENT",
              slideId,
              elementId: rotating.id,
              patch: { rotation: nextRotation.rotation },
            });
            requestElementFocus(rotating.id);
            announce(
              announceRotation(
                elementAccessibleName(rotating, slide?.elements),
                nextRotation.angle,
              ),
            );
            return;
          }

          const bbox = selectionBoundingBox(
            transformableElements.map((el) => el.box),
          );
          const transformed = rotateElementsAroundCenter(
            transformableElements,
            bbox.x + bbox.w / 2,
            bbox.y + bbox.h / 2,
            rotationDelta,
          );
          const patchesById: Record<string, ElementPatch> = {};
          for (const el of transformed) {
            patchesById[el.id] = {
              box: el.box,
              rotation: el.rotation,
            };
          }
          doCommitAndChange(kDeck, {
            type: "SET_ELEMENT_PATCHES",
            slideId,
            patchesById,
          });
          const focusId = transformed.some((el) => el.id === selected.id)
            ? selected.id
            : transformed[0]!.id;
          requestElementFocus(focusId);
          const focusElement =
            transformed.find((el) => el.id === focusId) ?? transformed[0]!;
          const nextRotation = applyKeyboardRotation(
            transformableElements.find((el) => el.id === focusElement.id)
              ?.rotation,
            rotationDelta,
          );
          announce(
            announceRotation(
              `${transformed.length} elements`,
              nextRotation.angle,
            ),
          );
          return;
        }

        // Alt+Arrow resizes the selected element box (#530), mirroring the
        // nudge step model: Alt+Arrow = 1%, Alt+Shift+Arrow = 5%. Right/Down
        // grow the right/bottom edge; Left/Up shrink them. Alt distinguishes
        // this from the bare-Arrow nudge below so the two never collide.
        if (event.altKey && isArrowKey(event.key)) {
          event.preventDefault();
          const stepPct = event.shiftKey ? 5 : 1;
          const boxesById: Record<string, ElementBox> = {};
          for (const id of selectedIds) {
            const el = slide?.elements?.find(
              (candidate) => candidate.id === id,
            );
            if (!el) continue;
            const nextBox = resizeBoxByStep(el.box, event.key, stepPct);
            if (nextBox !== el.box) boxesById[id] = nextBox;
          }
          if (Object.keys(boxesById).length > 0) {
            doCommitAndChange(kDeck, {
              type: "SET_ELEMENT_BOXES",
              slideId,
              boxesById,
            });
            requestElementFocus(selected.id);
            const primaryBox = boxesById[selected.id] ?? selected.box;
            announce(
              announceResize(
                elementAccessibleName(selected, slide?.elements),
                primaryBox.w,
                primaryBox.h,
              ),
            );
          }
          return;
        }

        const step = event.shiftKey ? 5 : 1;
        let dx = 0;
        let dy = 0;
        if (event.key === "ArrowLeft") dx = -step;
        else if (event.key === "ArrowRight") dx = step;
        else if (event.key === "ArrowUp") dy = -step;
        else if (event.key === "ArrowDown") dy = step;
        if (dx !== 0 || dy !== 0) {
          event.preventDefault();
          doCommitAndChange(kDeck, {
            type: "NUDGE_ELEMENTS",
            slideId,
            elementIds: selectedIds,
            dx,
            dy,
          });
          // Keep focus on the moved element and announce the new position
          // (#532, #533). The displayed coords mirror NUDGE_ELEMENTS clamping.
          requestElementFocus(selected.id);
          announce(
            announceMove(
              elementAccessibleName(selected, slide?.elements),
              Math.max(0, Math.min(100 - selected.box.w, selected.box.x + dx)),
              Math.max(0, Math.min(100 - selected.box.h, selected.box.y + dy)),
            ),
          );
          return;
        }
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setSelectedIndex((i) =>
          Math.min(keydownStateRef.current.deck.slides.length - 1, i + 1),
        );
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    announce,
    clearSelection,
    copyElementsToClipboard,
    doCommitAndChange,
    handleRequestClose,
    handleRedo,
    handleUndo,
    inspectorSheetOpen,
    keyboardHelpOpen,
    onDeckChange,
    pendingPatchesRef,
    pasteClipboardElements,
    requestElementFocus,
    setInspectorSheetOpen,
    setSelectedElementId,
    setSelectedElementIds,
    setSelectedIndex,
  ]);

  return {
    focusRequest,
    liveMessage,
    keyboardHelpOpen,
    setKeyboardHelpOpen,
    keyboardConnectorMode,
    requestElementFocus,
  };
}
