/**
 * Shared AI deck-generation fixtures (issue #267).
 *
 * Centralises the Lexical-serialised `contentJson` documents and the model-output
 * strings that the deck-generation tests exercise, so multiple suites
 * (`deck-source.test.ts`, `run-deck-generation.test.ts`, the end-to-end
 * `deck-generation-e2e.test.ts`) can import ONE source of truth instead of
 * re-declaring near-identical builders and drifting apart over time.
 *
 * The builders mirror the serialised JSON shapes the editor emits (the same
 * shapes `content/document-blocks.test.ts` / `deck-source.test.ts` already build by
 * hand). Like the modules under test, this file is intentionally free of any
 * network, DOM, or React dependency so it stays usable under `node --test`.
 *
 * It is deliberately NOT named `*.test.ts`, so the `node --test` glob
 * (`src/**\/*.test.ts`) never executes it as a suite.
 */

import type { Visual } from "@/lib/visual/schema";
import {
  buildContentJson,
  buildHeadingNode,
  buildHorizontalRuleNode,
  buildListNode,
  buildParagraphNode,
  buildQuoteNode,
  buildTextNode,
  buildVisualLexicalNode,
  type SerializedFixtureRootChild,
  type SerializedFixtureTextNode,
} from "@/test/builders/lexical";
import {
  buildVisual,
  buildVisualMap,
  buildVisualNode,
} from "@/test/builders/visual";

// ---------------------------------------------------------------------------
// Lexical text-format bitmask flags (subset the editor uses for emphasis).
// ---------------------------------------------------------------------------

export {
  FORMAT_BOLD,
  FORMAT_CODE,
  FORMAT_ITALIC,
} from "@/test/builders/lexical";

export function visual(id: string, overrides: Partial<Visual> = {}): Visual {
  return buildVisual({
    nodes: [
      buildVisualNode({ id: `${id}-n1`, label: "Start" }),
      buildVisualNode({ id: `${id}-n2`, label: "Finish", x: 360 }),
    ],
    edges: [],
    ...overrides,
  });
}

export function visualNode(visualId: string, v: Visual = visual(visualId)) {
  return buildVisualLexicalNode(visualId, v);
}

export function text(value: string, format = 0): SerializedFixtureTextNode {
  return buildTextNode(value, { format });
}

export function paragraph(
  ...children: SerializedFixtureTextNode[]
): SerializedFixtureRootChild {
  return buildParagraphNode(children);
}

export function heading(level: 1 | 2 | 3, value: string) {
  return buildHeadingNode(level, value);
}

export function quote(value: string) {
  return buildQuoteNode(value);
}

export function list(items: string[]) {
  return buildListNode(items);
}

export function hr() {
  return buildHorizontalRuleNode();
}

/** Serialises a list of root children into a Lexical editor-state string. */
export function state(children: SerializedFixtureRootChild[]): string {
  return buildContentJson(children);
}

/** Builds a `{ visualId → Visual }` map from id/visual pairs. */
export function visualMap(
  ...visuals: Array<[string, Visual]>
): ReadonlyMap<string, Visual> {
  return buildVisualMap(...visuals);
}

// ---------------------------------------------------------------------------
// Representative visuals + inventory map.
// ---------------------------------------------------------------------------

/** The single representative visual embedded in {@link DOC_WITH_VISUAL}. */
export const VISUAL_V1: Visual = visual("v1", {
  title: "Alpha Flow",
} as Partial<Visual>);

/** The `{ visualId → Visual }` map matching {@link DOC_WITH_VISUAL}. */
export const VISUALS_V1: ReadonlyMap<string, Visual> = visualMap([
  "v1",
  VISUAL_V1,
]);

/** An empty visuals map, for the no-visuals documents. */
export const VISUALS_EMPTY: ReadonlyMap<string, Visual> = visualMap();

// ---------------------------------------------------------------------------
// contentJson document fixtures.
// ---------------------------------------------------------------------------

/**
 * A representative document WITH an embedded visual node, so
 * `buildDeckSource` yields a non-empty visual inventory (id `v1`).
 */
export const DOC_WITH_VISUAL: string = state([
  heading(1, "Title"),
  paragraph(text("Intro paragraph.")),
  heading(2, "Section"),
  list(["First point", "Second point"]),
  visualNode("v1", VISUAL_V1),
  quote("A pithy quote"),
]);

/** A headings-only document (no detail blocks, no visuals). */
export const DOC_HEADINGS_ONLY: string = state([
  heading(1, "One"),
  heading(2, "Two"),
  heading(3, "Three"),
]);

/** A document with prose and bullets but NO visual nodes. */
export const DOC_NO_VISUALS: string = state([
  heading(1, "Title"),
  paragraph(text("Body text.")),
  list(["First point", "Second point"]),
]);

/**
 * A document large enough to blow past `MAX_INPUT_CHARS`, so `buildDeckSource`
 * trims detail and reports `truncated === true` while keeping every heading.
 */
export const DOC_HUGE: string = (() => {
  const children: SerializedFixtureRootChild[] = [heading(1, "Top")];
  for (let i = 0; i < 200; i++) {
    children.push(heading(2, `Section ${i}`));
    children.push(paragraph(text(`detail ${i} ` + "x".repeat(200))));
  }
  return state(children);
})();

/** An empty document (root with no children). */
export const DOC_EMPTY: string = state([]);

// ---------------------------------------------------------------------------
// Model-output fixtures (what a stubbed `complete` returns).
// ---------------------------------------------------------------------------

/**
 * A valid deck JSON string. The media slide references the inventory visual
 * `v1` AND an invented `ghost` id that is NOT in the inventory, so the pipeline
 * can be asserted to PRESERVE `v1` and STRIP the orphaned `ghost`.
 */
export const VALID_DECK_JSON: string = JSON.stringify({
  theme: "indigo",
  slides: [
    {
      title: "Welcome",
      bullets: ["First point", "Second point"],
      layout: "title",
      elements: [
        {
          kind: "text",
          text: "Welcome",
          role: "title",
          box: { x: 8, y: 8, w: 84, h: 20 },
        },
      ],
    },
    {
      title: "Overview",
      layout: "media",
      elements: [
        {
          kind: "text",
          text: "Overview",
          role: "title",
          box: { x: 6, y: 6, w: 88, h: 16 },
        },
        {
          kind: "visual",
          visualId: "v1",
          box: { x: 10, y: 28, w: 80, h: 60 },
        },
        {
          kind: "visual",
          visualId: "ghost",
          box: { x: 10, y: 28, w: 40, h: 30 },
        },
      ],
    },
  ],
});

/** The same valid deck JSON wrapped in a fenced ```json code block. */
export const CODE_FENCED_DECK_JSON: string = `Here is your deck:\n\`\`\`json\n${VALID_DECK_JSON}\n\`\`\`\n`;

/** A response that is not valid JSON at all (forces the retry path). */
export const MALFORMED_DECK_JSON: string = "this is not JSON at all {";

// ---------------------------------------------------------------------------
// Stub completion helpers.
// ---------------------------------------------------------------------------

/** A `complete` stub that always returns the same canned response. */
export function constantComplete(response: string) {
  return async () => response;
}

/**
 * A `complete` stub that records how many times it was invoked, so tests can
 * assert the retry behaviour (e.g. "called twice before giving up").
 */
export function countingComplete(response: string): {
  complete: () => Promise<string>;
  calls: () => number;
} {
  let calls = 0;
  return {
    complete: async () => {
      calls += 1;
      return response;
    },
    calls: () => calls,
  };
}
