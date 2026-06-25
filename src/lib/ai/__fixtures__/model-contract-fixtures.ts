import { VISUAL_SCHEMA_VERSION, type VisualKind } from "@/lib/visual/schema";

export function visualModelOutput(
  type: VisualKind = "flowchart",
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: VISUAL_SCHEMA_VERSION,
    type,
    title: "Launch plan",
    nodes: [
      { id: "start", label: "Start", x: 120, y: 120 },
      { id: "finish", label: "Finish", x: 360, y: 120 },
    ],
    edges: [{ id: "e1", from: "start", to: "finish", directed: true }],
    ...overrides,
  };
}

export function visualsModelPayload(
  count = 3,
  type: VisualKind = "flowchart",
): Record<string, unknown> {
  return {
    visuals: Array.from({ length: count }, (_, index) =>
      visualModelOutput(type, {
        title: `Launch plan ${index + 1}`,
        nodes: [
          { id: `start-${index}`, label: "Start", x: 120, y: 120 },
          { id: `finish-${index}`, label: "Finish", x: 360, y: 120 },
        ],
        edges: [
          {
            id: `e-${index}`,
            from: `start-${index}`,
            to: `finish-${index}`,
            directed: true,
          },
        ],
      }),
    ),
  };
}

export function invalidVisualsModelPayload(): Record<string, unknown> {
  return {
    visuals: [
      visualModelOutput(),
      { version: VISUAL_SCHEMA_VERSION, type: "not-a-kind", nodes: [] },
      { garbage: true },
    ],
  };
}

export function deckModelOutput(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    themeId: "indigo",
    slides: [
      {
        title: "Welcome",
        bullets: ["First point", "Second point"],
        notes: "Speaker notes here.",
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
        title: "Details",
        bullets: ["More"],
        layout: "content",
        elements: [
          {
            kind: "bullets",
            items: [{ text: "More" }],
            box: { x: 12, y: 24, w: 76, h: 48 },
          },
        ],
      },
    ],
    ...overrides,
  };
}

export function repairableDeckModelOutput(): Record<string, unknown> {
  return deckModelOutput({
    themeId: "not-a-theme",
    slides: [
      {
        title: "Repair me",
        bullets: ["Keep this"],
        layout: "carousel",
        elements: [
          {
            id: "same",
            kind: "text",
            text: "Repair me",
            role: "title",
            box: { x: -50, y: 150, w: 999, h: -10 },
            style: { fontSize: 6, align: "sideways", color: "not-a-color" },
          },
          {
            id: "same",
            kind: "bullets",
            items: [{ text: "One" }, { text: "Two" }],
            box: null,
          },
          {
            kind: "visual",
            visualId: "vis-1",
            box: { x: 10, y: 20, w: 30, h: 40 },
          },
          {
            kind: "visual",
            visualId: "",
            box: { x: 10, y: 20, w: 30, h: 40 },
          },
        ],
      },
    ],
  });
}

export const VALID_VISUALS_MODEL_JSON = JSON.stringify(visualsModelPayload());
export const INVALID_VISUALS_MODEL_JSON = JSON.stringify(
  invalidVisualsModelPayload(),
);
export const VALID_DECK_MODEL_JSON = JSON.stringify(deckModelOutput());
export const REPAIRABLE_DECK_MODEL_JSON = JSON.stringify(
  repairableDeckModelOutput(),
);
export const MALFORMED_MODEL_JSON = "this is not JSON at all {";
