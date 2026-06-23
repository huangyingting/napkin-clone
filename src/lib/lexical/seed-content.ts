/**
 * Pure helper that builds a minimal Lexical editor-state JSON object whose
 * root contains one intro paragraph followed by one VisualNode decorator block.
 *
 * It produces the same serialized paragraph shape that `from-markdown.ts`
 * emits (including durable `bid`) and the shape that `VisualNode.exportJSON()`
 * emits for visual blocks, so the result round-trips correctly through
 * Lexical's `parseEditorState`.
 *
 * Intentionally has no `lexical`/React imports so it stays pure and can be
 * used from Node scripts (seed, tests) without a DOM.
 */

import type { Visual } from "@/lib/visual/schema";
import { generateBlockId } from "./block-id";

interface SerializedTextNode {
  detail: number;
  format: number;
  mode: string;
  style: string;
  text: string;
  type: "text";
  version: number;
}

interface SerializedParagraphNode {
  bid?: string;
  children: SerializedTextNode[];
  direction: null;
  format: "";
  indent: number;
  type: "paragraph";
  version: number;
  textFormat: number;
  textStyle: string;
}

/** Matches the shape produced by `VisualNode.exportJSON()`. */
interface SerializedVisualNodeJSON {
  type: "visual";
  version: number;
  visual: Visual;
  visualId: string;
}

type RootChild = SerializedParagraphNode | SerializedVisualNodeJSON;

export interface SeedLexicalState {
  root: {
    children: RootChild[];
    direction: null;
    format: "";
    indent: number;
    type: "root";
    version: number;
  };
}

function textNode(text: string): SerializedTextNode {
  return {
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
    text,
    type: "text",
    version: 1,
  };
}

function paragraphNode(text: string): SerializedParagraphNode {
  return {
    bid: generateBlockId(),
    children: text === "" ? [] : [textNode(text)],
    direction: null,
    format: "",
    indent: 0,
    type: "paragraph",
    version: 1,
    textFormat: 0,
    textStyle: "",
  };
}

/**
 * Builds a Lexical editor-state JSON with an intro paragraph followed by a
 * VisualNode block referencing the given {@link visual} and {@link visualId}.
 *
 * @param introText - Shown as a paragraph above the visual.
 * @param visual - The {@link Visual} payload embedded in the node.
 * @param visualId - The database `Visual.id` that correlates the node with its
 *   persisted row (used by the contextual editing commands).
 */
export function buildSeedContentJson(
  introText: string,
  visual: Visual,
  visualId: string,
): SeedLexicalState {
  const visualBlock: SerializedVisualNodeJSON = {
    type: "visual",
    version: 1,
    visual,
    visualId,
  };

  return {
    root: {
      children: [paragraphNode(introText), visualBlock],
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  };
}
