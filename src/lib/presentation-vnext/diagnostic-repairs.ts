/** Command-backed repair dispatcher for v7 presentation diagnostics. */

import type { DeckV7, SlideChildNode, SlideNode } from "./schema";
import type { StyleBinding } from "./style-schema";
import type { DiagnosticAction, PresentationDiagnostic } from "./diagnostics";
import { getDiagnosticNodeId, getDiagnosticSlideId } from "./diagnostics";
import {
  resetLocalStyleOverride,
  splitNodeToSlide,
  updateNodeStyleBinding,
  updateSlideControls,
} from "./editor-commands";

export type DiagnosticRepairFocus = {
  slideId: string;
  nodeId?: string;
};

export type DiagnosticRepairResult =
  | {
      status: "applied";
      deck: DeckV7;
      focus: DiagnosticRepairFocus;
      announcement: string;
    }
  | {
      status: "host-action";
      port: "asset-panel";
      focus: DiagnosticRepairFocus;
      announcement: string;
    }
  | { status: "noop"; reason: string };

export type DiagnosticRepairContext = {
  activeSlideId?: string;
  selectedNodeId?: string;
  defaultStyleBindingForNode: (node: SlideChildNode) => StyleBinding;
};

function findNodeById(
  nodes: readonly SlideChildNode[],
  id: string,
): SlideChildNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.type === "group") {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function findSlideForNode(deck: DeckV7, nodeId: string): SlideNode | undefined {
  return deck.slides.find((slide) => findNodeById(slide.children, nodeId));
}

function resolveRepairTarget(
  deck: DeckV7,
  diagnostic: PresentationDiagnostic,
  context: DiagnosticRepairContext,
): { slide: SlideNode | undefined; node: SlideChildNode | undefined } {
  const nodeId = getDiagnosticNodeId(diagnostic) ?? context.selectedNodeId;
  const slideId =
    getDiagnosticSlideId(diagnostic) ??
    (nodeId ? findSlideForNode(deck, nodeId)?.id : undefined) ??
    context.activeSlideId;
  const slide = slideId
    ? deck.slides.find((candidate) => candidate.id === slideId)
    : undefined;
  const node =
    nodeId && slide ? findNodeById(slide.children, nodeId) : undefined;
  return { slide, node };
}

function targetDiagnostic(
  diagnostic: PresentationDiagnostic,
  action: DiagnosticAction,
): PresentationDiagnostic {
  if (!action.target) return diagnostic;
  return { ...diagnostic, target: action.target };
}

export function applyDiagnosticRepairAction(
  deck: DeckV7,
  action: DiagnosticAction,
  diagnostic: PresentationDiagnostic,
  context: DiagnosticRepairContext,
): DiagnosticRepairResult {
  const targetedDiagnostic = targetDiagnostic(diagnostic, action);
  const { slide, node } = resolveRepairTarget(
    deck,
    targetedDiagnostic,
    context,
  );

  switch (action.type) {
    case "reset-to-theme":
    case "remove-override": {
      if (!slide || !node) {
        return { status: "noop", reason: "No style target was found." };
      }
      return {
        status: "applied",
        deck: resetLocalStyleOverride(deck, slide.id, node.id),
        focus: { slideId: slide.id, nodeId: node.id },
        announcement: "Removed local style overrides.",
      };
    }
    case "replace-style-ref": {
      if (!slide || !node) {
        return { status: "noop", reason: "No style ref target was found." };
      }
      return {
        status: "applied",
        deck: updateNodeStyleBinding(
          deck,
          slide.id,
          node.id,
          context.defaultStyleBindingForNode(node),
        ),
        focus: { slideId: slide.id, nodeId: node.id },
        announcement: "Replaced style ref with the default style.",
      };
    }
    case "choose-denser-layout": {
      if (!slide) {
        return { status: "noop", reason: "No slide target was found." };
      }
      return {
        status: "applied",
        deck: updateSlideControls(deck, slide.id, { density: "dense" }),
        focus: { slideId: slide.id, ...(node ? { nodeId: node.id } : {}) },
        announcement: "Applied a denser slide layout.",
      };
    }
    case "open-asset-panel": {
      if (!slide) {
        return { status: "noop", reason: "No asset target was found." };
      }
      return {
        status: "host-action",
        port: "asset-panel",
        focus: { slideId: slide.id, ...(node ? { nodeId: node.id } : {}) },
        announcement: "Opened the asset repair target.",
      };
    }
    case "split-slide": {
      if (!slide || !node) {
        return { status: "noop", reason: "No node target was found." };
      }
      const result = splitNodeToSlide(deck, slide.id, node.id);
      if (result.index < 0) {
        return { status: "noop", reason: "The node could not be split." };
      }
      return {
        status: "applied",
        deck: result.deck,
        focus: { slideId: result.slideId, nodeId: result.nodeId },
        announcement: "Moved node to a new split slide.",
      };
    }
  }
}
