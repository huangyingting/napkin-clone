import { buildDeck, buildSlide, buildTextElement } from "@/test/builders/deck";
import type { Deck } from "./deck-core";

export function currentDeck(): unknown {
  return buildDeck({
    themeId: "default",
    slides: [
      buildSlide({
        id: "sl-current",
        title: "Current",
        bullets: ["a", "b"],
        layout: "content",
        elements: [
          buildTextElement({
            id: "txt-1",
            text: "Current",
            role: "title",
            zIndex: 0,
            box: { x: 6, y: 6, w: 88, h: 16 },
            style: { fontSize: 6, bold: true, italic: false, align: "left" },
          }),
        ],
      }),
    ],
  });
}

export function slideFixture(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return buildSlide({
    id: "sl-fixture",
    title: "",
    bullets: [],
    layout: "blank",
    elements: [],
    ...overrides,
  } as Partial<Deck["slides"][number]>) as unknown as Record<string, unknown>;
}

export function elementDeck(elements: unknown[]): unknown {
  return buildDeck({
    themeId: "indigo",
    slides: [
      slideFixture({
        id: "sl-element",
        themeId: "indigo",
        background: "#101010",
        accent: "#abcdef",
        elements,
      }) as unknown as Deck["slides"][number],
    ],
  });
}
