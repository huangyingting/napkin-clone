import { LEGACY_DECK_SCHEMA_VERSION } from "./deck-core";

type RawObject = Record<string, unknown>;

export function currentDeck(): unknown {
  return {
    schemaVersion: LEGACY_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides: [
      {
        id: "sl-current",
        index: 0,
        title: "Current",
        elements: [
          {
            id: "txt-1",
            kind: "text",
            role: "title",
            zIndex: 0,
            box: { x: 6, y: 6, w: 88, h: 16 },
            content: {
              kind: "text",
              text: "Current",
              paragraphs: [{ text: "Current" }],
            },
            designOverrides: {
              textStyle: {
                fontSize: 6,
                bold: true,
                italic: false,
                align: "left",
              },
            },
          },
        ],
      },
    ],
  };
}

export function slideFixture(overrides: RawObject = {}): RawObject {
  return {
    id: "sl-fixture",
    index: 0,
    title: "",
    elements: [],
    ...overrides,
  };
}

export function elementDeck(elements: unknown[]): unknown {
  return {
    schemaVersion: LEGACY_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "indigo" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides: [
      slideFixture({
        id: "sl-element",
        designOverrides: {
          background: { type: "solid", color: { value: "#101010" } },
          accent: { value: "#abcdef" },
        },
        elements,
      }),
    ],
  };
}
