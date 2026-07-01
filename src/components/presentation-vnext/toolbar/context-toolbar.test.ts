import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, test } from "node:test";

import {
  buildSlideToolInsertActions,
  isContextToolbarInlineTextCommandEnabled,
  restoreFocusAfterContextToolbarEscape,
  seedContextToolbarStyles,
} from "./context-toolbar";
import type { SlideChildNode } from "@/lib/presentation-vnext/schema";
import type { StyleObject } from "@/lib/presentation-vnext/style-schema";

const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);
const source = readFileSync(
  new URL("./context-toolbar.tsx", import.meta.url),
  "utf8",
);

describe("buildSlideToolInsertActions", () => {
  test("returns all current-object insertion actions in stable order", () => {
    const actions = buildSlideToolInsertActions({
      onInsertText: () => undefined,
      onInsertShape: () => undefined,
      onInsertImage: () => undefined,
      onInsertVisual: () => undefined,
      onInsertConnector: () => undefined,
      onInsertTable: () => undefined,
    });

    assert.deepEqual(
      actions.map((action) => action.label),
      [
        "Insert text",
        "Insert shape",
        "Insert image",
        "Insert visual",
        "Insert connector",
        "Insert table",
      ],
    );
  });

  test("omits actions when callbacks are unavailable", () => {
    const actions = buildSlideToolInsertActions({
      onInsertText: () => undefined,
      onInsertTable: () => undefined,
    });

    assert.deepEqual(
      actions.map((action) => action.label),
      ["Insert text", "Insert table"],
    );
  });

  test("preserves callback wiring for keyboard-triggered inserts", () => {
    const calls: string[] = [];
    const actions = buildSlideToolInsertActions({
      onInsertText: () => calls.push("text"),
      onInsertShape: () => calls.push("shape"),
      onInsertImage: () => calls.push("image"),
      onInsertVisual: () => calls.push("visual"),
      onInsertConnector: () => calls.push("connector"),
      onInsertTable: () => calls.push("table"),
    });

    for (const action of actions) {
      action.onClick();
    }

    assert.deepEqual(calls, [
      "text",
      "shape",
      "image",
      "visual",
      "connector",
      "table",
    ]);
  });
});

afterEach(() => {
  if (originalDocumentDescriptor) {
    Object.defineProperty(globalThis, "document", originalDocumentDescriptor);
    return;
  }
  Reflect.deleteProperty(globalThis, "document");
});

describe("restoreFocusAfterContextToolbarEscape", () => {
  test("prefers explicit stage-focus callback", () => {
    let callbackCalls = 0;
    let blurCalls = 0;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        activeElement: {
          blur: () => {
            blurCalls += 1;
          },
        },
      },
    });

    restoreFocusAfterContextToolbarEscape(() => {
      callbackCalls += 1;
    });

    assert.equal(callbackCalls, 1);
    assert.equal(blurCalls, 0);
  });

  test("blurs active element when callback is absent", () => {
    let blurCalls = 0;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        activeElement: {
          blur: () => {
            blurCalls += 1;
          },
        },
      },
    });

    restoreFocusAfterContextToolbarEscape(undefined);

    assert.equal(blurCalls, 1);
  });

  test("is safe when document is unavailable", () => {
    Reflect.deleteProperty(globalThis, "document");
    assert.doesNotThrow(() => restoreFocusAfterContextToolbarEscape(undefined));
  });
});

describe("seedContextToolbarStyles", () => {
  test("seeds shape controls from resolved style values", () => {
    const node: SlideChildNode = {
      id: "shape-1",
      type: "shape",
      role: "card",
      layout: { frame: { x: 0, y: 0, w: 40, h: 20 }, zIndex: 1 },
      content: {
        shape: "rect",
        text: { paragraphs: [{ id: "p-1", text: "Label" }] },
      },
      localStyle: {},
    };
    const resolvedStyle: StyleObject = {
      text: { color: "#1d4ed8", fontSizePt: 26 },
      fill: { type: "solid", color: "#dbeafe" },
      stroke: { color: "#2563eb", widthPt: 3 },
      opacity: 0.84,
    };

    const seed = seedContextToolbarStyles(node, resolvedStyle);

    assert.equal(seed.textColor, "#1d4ed8");
    assert.equal(seed.fontSize, 26);
    assert.equal(seed.fillColor, "#dbeafe");
    assert.equal(seed.shapeStrokeColor, "#2563eb");
    assert.equal(seed.shapeStrokeWidth, 3);
    assert.equal(seed.opacity, 0.84);
  });

  test("seeds connector controls from resolved connector stroke values", () => {
    const node: SlideChildNode = {
      id: "connector-1",
      type: "connector",
      role: "connector",
      layout: { frame: { x: 0, y: 0, w: 40, h: 20 }, zIndex: 1 },
      content: {
        from: { kind: "point", point: { x: 0, y: 0 } },
        to: { kind: "point", point: { x: 100, y: 100 } },
      },
      localStyle: {},
    };
    const resolvedStyle: StyleObject = {
      connector: {
        stroke: { color: "#0f172a", widthPt: 2.5, dash: "dashed" },
        startArrow: "filled",
        endArrow: "none",
      },
    };

    const seed = seedContextToolbarStyles(node, resolvedStyle);

    assert.equal(seed.connectorStrokeColor, "#0f172a");
    assert.equal(seed.connectorStrokeWidth, 2.5);
    assert.equal(seed.connectorStartArrow, "filled");
    assert.equal(seed.connectorEndArrow, "none");
  });
});

describe("inline align persistence wiring", () => {
  test("always mirrors align commands to persistent local style patches", () => {
    assert.equal(
      source.includes("onUpdateSelectedLocalStyle?.({ text: { align } });"),
      true,
    );
    assert.equal(
      source.includes(
        "if (!isInlineEditing) onUpdateSelectedLocalStyle?.({ text: { align } });",
      ),
      false,
    );
  });
});

describe("slide delete affordance wiring", () => {
  test("threads canDeleteSlide into the context-toolbar contract", () => {
    assert.equal(source.includes("canDeleteSlide?: boolean;"), true);
    assert.equal(source.includes("canDeleteSlide = true,"), true);
  });

  test("disables Delete slide when deletion is unavailable", () => {
    assert.equal(
      source.includes("disabled={!canDeleteSlide || !onDeleteSlide}"),
      true,
    );
  });
});

describe("isContextToolbarInlineTextCommandEnabled", () => {
  test("disables inline-only commands outside inline edit mode", () => {
    assert.equal(
      isContextToolbarInlineTextCommandEnabled("strikethrough", false),
      false,
    );
    assert.equal(
      isContextToolbarInlineTextCommandEnabled("bullet-list", false),
      false,
    );
    assert.equal(
      isContextToolbarInlineTextCommandEnabled("numbered-list", false),
      false,
    );
    assert.equal(
      isContextToolbarInlineTextCommandEnabled("indent-list", false),
      false,
    );
    assert.equal(
      isContextToolbarInlineTextCommandEnabled("outdent-list", false),
      false,
    );
    assert.equal(
      isContextToolbarInlineTextCommandEnabled("link", false),
      false,
    );
    assert.equal(
      isContextToolbarInlineTextCommandEnabled("unlink", false),
      false,
    );
  });

  test("keeps text commands enabled in inline edit mode", () => {
    assert.equal(
      isContextToolbarInlineTextCommandEnabled("strikethrough", true),
      true,
    );
    assert.equal(
      isContextToolbarInlineTextCommandEnabled("bullet-list", true),
      true,
    );
    assert.equal(
      isContextToolbarInlineTextCommandEnabled("numbered-list", true),
      true,
    );
    assert.equal(
      isContextToolbarInlineTextCommandEnabled("indent-list", true),
      true,
    );
    assert.equal(
      isContextToolbarInlineTextCommandEnabled("outdent-list", true),
      true,
    );
    assert.equal(isContextToolbarInlineTextCommandEnabled("link", true), true);
    assert.equal(
      isContextToolbarInlineTextCommandEnabled("unlink", true),
      true,
    );
  });

  test("does not disable commands that already mutate selected node style", () => {
    assert.equal(isContextToolbarInlineTextCommandEnabled("bold", false), true);
    assert.equal(
      isContextToolbarInlineTextCommandEnabled("italic", false),
      true,
    );
    assert.equal(
      isContextToolbarInlineTextCommandEnabled("underline", false),
      true,
    );
    assert.equal(
      isContextToolbarInlineTextCommandEnabled("align-left", false),
      true,
    );
    assert.equal(
      isContextToolbarInlineTextCommandEnabled("font-size", false),
      true,
    );
  });
});
