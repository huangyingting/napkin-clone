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
    schemaVersion: 6,
    canvas: { format: "16:9" },
    design: { themeId: "indigo" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides: [
      {
        id: "slide-welcome",
        index: 0,
        title: "Welcome",
        notes: "Speaker notes here.",
        templateId: "title",
        elements: [
          {
            id: "title-welcome",
            kind: "text",
            role: "title",
            box: { x: 8, y: 8, w: 84, h: 20 },
            zIndex: 0,
            content: {
              kind: "text",
              text: "Welcome",
              paragraphs: [{ text: "Welcome" }],
            },
          },
        ],
      },
      {
        id: "slide-details",
        index: 1,
        title: "Details",
        templateId: "content",
        notes: "",
        elements: [
          {
            id: "body-details",
            kind: "text",
            role: "bullet",
            box: { x: 12, y: 24, w: 76, h: 48 },
            zIndex: 0,
            content: {
              kind: "text",
              text: "More",
              paragraphs: [{ text: "More", listType: "bullet" }],
            },
          },
        ],
      },
    ],
    ...overrides,
  };
}

export function repairableDeckModelOutput(): Record<string, unknown> {
  return deckModelOutput({
    design: { themeId: "not-a-theme" },
    slides: [
      {
        id: "sl-1",
        index: 0,
        title: "Repair me",
        templateId: "carousel",
        notes: "",
        elements: [
          {
            id: "same",
            kind: "text",
            role: "title",
            box: { x: -50, y: 150, w: 999, h: -10 },
            zIndex: 0,
            content: {
              kind: "text",
              text: "Repair me",
              paragraphs: [{ text: "Repair me" }],
            },
            designOverrides: {
              textStyle: {
                fontSize: 6,
                align: "sideways",
                color: "not-a-color",
              },
            },
          },
          {
            id: "same",
            kind: "text",
            role: "bullet",
            box: null,
            zIndex: 1,
            content: {
              kind: "text",
              text: "One\nTwo",
              paragraphs: [
                { text: "One", listType: "bullet" },
                { text: "Two", listType: "bullet" },
              ],
            },
          },
          {
            kind: "visual",
            box: { x: 10, y: 20, w: 30, h: 40 },
            zIndex: 2,
            content: { kind: "visual", visualId: "vis-1" },
          },
          {
            kind: "visual",
            box: { x: 10, y: 20, w: 30, h: 40 },
            zIndex: 3,
            content: { kind: "visual", visualId: "" },
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
