import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, test } from "node:test";

import {
  buildSlideToolInsertActions,
  contextToolbarTextRoleFontSizePt,
  isContextToolbarInlineTextCommandEnabled,
  isContextToolbarTextRole,
  routeContextToolbarAlign,
  routeContextToolbarConnectorArrow,
  routeContextToolbarConnectorRouting,
  routeContextToolbarConnectorStrokeColor,
  routeContextToolbarConnectorStrokeWidth,
  routeContextToolbarDeleteSlide,
  routeContextToolbarDetachDecoration,
  routeContextToolbarDistribute,
  routeContextToolbarFontSize,
  routeContextToolbarHideSelection,
  routeContextToolbarImageCropToggle,
  routeContextToolbarImageFit,
  routeContextToolbarLockToggle,
  routeContextToolbarMatchSize,
  routeContextToolbarOpacity,
  routeContextToolbarRotation,
  routeContextToolbarSlideBackground,
  routeContextToolbarTableHeaderToggle,
  routeContextToolbarTextAlign,
  routeContextToolbarTextColor,
  routeContextToolbarTextCommand,
  routeContextToolbarTextRoleChange,
  routeContextToolbarVisualBackgroundToggle,
  routeContextToolbarVisualThemeChange,
  resolveContextToolbarTextRole,
  restoreFocusAfterContextToolbarEscape,
  seedContextToolbarStyles,
  tableWithAddedColumn,
  tableWithAddedRow,
  tableWithDeletedLastColumn,
  tableWithDeletedLastRow,
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

describe("context toolbar measurement scheduling", () => {
  test("does not keep a requestAnimationFrame polling loop alive", () => {
    assert.equal(source.includes("const tick = () => {"), false);
    assert.equal(
      source.includes("frame = window.requestAnimationFrame(tick);"),
      false,
    );
  });

  test("updates position from event and observer scheduling", () => {
    assert.equal(
      source.includes("const schedulePositionUpdate = () => {"),
      true,
    );
    assert.equal(
      source.includes("new ResizeObserver(schedulePositionUpdate)"),
      true,
    );
    assert.equal(
      source.includes("new MutationObserver(schedulePositionUpdate)"),
      true,
    );
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

describe("strikethrough toolbar persistence wiring", () => {
  test("routes strikethrough through runTextCommand and local style updates", () => {
    assert.equal(source.includes("command: ContextToolbarTextCommand"), true);
    assert.equal(
      source.includes("text: { strikethrough: !textStyle?.strikethrough }"),
      true,
    );
    assert.equal(
      source.includes('onClick={() => runTextCommand("strikethrough")}'),
      true,
    );
  });
});

describe("text role semantic persistence", () => {
  test("normalizes and validates context-toolbar text role options", () => {
    assert.equal(isContextToolbarTextRole("title"), true);
    assert.equal(isContextToolbarTextRole("quote"), true);
    assert.equal(isContextToolbarTextRole("card"), false);
    assert.equal(resolveContextToolbarTextRole(undefined), "body");
    assert.equal(resolveContextToolbarTextRole("card"), "body");
    assert.equal(resolveContextToolbarTextRole("subtitle"), "subtitle");
  });

  test("maps text roles to stable toolbar font-size presets", () => {
    assert.equal(contextToolbarTextRoleFontSizePt("title"), 34);
    assert.equal(contextToolbarTextRoleFontSizePt("subtitle"), 24);
    assert.equal(contextToolbarTextRoleFontSizePt("body"), 18);
    assert.equal(contextToolbarTextRoleFontSizePt("quote"), 26);
    assert.equal(contextToolbarTextRoleFontSizePt("caption"), 11);
  });

  test("routes text-role changes through node attributes and disables without selection", () => {
    assert.equal(
      source.includes("onUpdateSelectedAttributes?.({ role });"),
      true,
    );
    assert.equal(
      source.includes(
        "disabled={!selectedNode || !onUpdateSelectedAttributes}",
      ),
      true,
    );
  });
});

describe("context toolbar more-menu accessibility wiring", () => {
  test("exposes the More trigger as a menu button", () => {
    assert.equal(source.includes('hasPopup="menu"'), true);
    assert.equal(source.includes("buttonRef={moreMenuTriggerRef}"), true);
    assert.equal(
      source.includes("controls={moreOpen ? moreMenuId : undefined}"),
      true,
    );
  });

  test("focuses and keyboard-navigates menu commands", () => {
    assert.equal(
      source.includes("focusFirstMenuCommand(moreMenuRef.current)"),
      true,
    );
    assert.equal(source.includes("onKeyDown={handleMoreMenuKeyDown}"), true);
    assert.equal(source.includes("moveMenuCommandFocus({"), true);
    assert.equal(source.includes("closeMoreMenuAndRestoreFocus();"), true);
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
      isContextToolbarInlineTextCommandEnabled("strikethrough", false),
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

describe("context toolbar routing helpers", () => {
  test("routes text formatting commands through inline command dispatch and persisted style patches", () => {
    const dispatched: unknown[] = [];
    const patches: unknown[] = [];

    routeContextToolbarTextCommand({
      command: "strikethrough",
      isInlineEditing: false,
      textStyle: { strikethrough: false },
      onUpdateSelectedLocalStyle: (patch) => patches.push(patch),
      dispatchCommand: (payload) => dispatched.push(payload),
    });

    assert.deepEqual(dispatched, [{ command: "strikethrough" }]);
    assert.deepEqual(patches, [{ text: { strikethrough: true } }]);
  });

  test("skips persisted text style patches while inline editing", () => {
    const dispatched: unknown[] = [];
    const patches: unknown[] = [];

    routeContextToolbarTextCommand({
      command: "bold",
      isInlineEditing: true,
      textStyle: { weight: 400 },
      onUpdateSelectedLocalStyle: (patch) => patches.push(patch),
      dispatchCommand: (payload) => dispatched.push(payload),
    });

    assert.deepEqual(dispatched, [{ command: "bold" }]);
    assert.deepEqual(patches, []);
  });

  test("routes text color, alignment, and font-size updates with the expected payloads", () => {
    const dispatched: unknown[] = [];
    const patches: unknown[] = [];

    routeContextToolbarTextColor({
      color: "#2563eb",
      isInlineEditing: false,
      onUpdateSelectedLocalStyle: (patch) => patches.push(patch),
      dispatchCommand: (payload) => dispatched.push(payload),
    });
    routeContextToolbarTextAlign({
      align: "center",
      onUpdateSelectedLocalStyle: (patch) => patches.push(patch),
      dispatchCommand: (payload) => dispatched.push(payload),
    });
    routeContextToolbarFontSize({
      value: 28,
      isInlineEditing: false,
      onUpdateSelectedLocalStyle: (patch) => patches.push(patch),
      dispatchCommand: (payload) => dispatched.push(payload),
    });

    assert.deepEqual(dispatched, [
      { command: "color", value: "#2563eb" },
      { command: "align-center" },
      { command: "font-size", value: "28pt" },
    ]);
    assert.deepEqual(patches, [
      { text: { color: "#2563eb" } },
      { text: { align: "center" } },
      { text: { fontSizePt: 28 } },
    ]);
  });

  test("routes text role updates through attributes plus semantic font-size defaults", () => {
    const attributes: unknown[] = [];
    const stylePatches: unknown[] = [];

    routeContextToolbarTextRoleChange({
      role: "title",
      onUpdateSelectedAttributes: (patch) => attributes.push(patch),
      onUpdateSelectedLocalStyle: (patch) => stylePatches.push(patch),
    });
    routeContextToolbarTextRoleChange({
      role: "not-a-role",
      onUpdateSelectedAttributes: (patch) => attributes.push(patch),
      onUpdateSelectedLocalStyle: (patch) => stylePatches.push(patch),
    });

    assert.deepEqual(attributes, [{ role: "title" }]);
    assert.deepEqual(stylePatches, [{ text: { fontSizePt: 34 } }]);
  });

  test("routes image crop and fit commands through selected-content patches", () => {
    const imageNodeNoCrop: SlideChildNode = {
      id: "image-1",
      type: "image",
      role: "image",
      layout: { frame: { x: 0, y: 0, w: 10, h: 10 }, zIndex: 1 },
      content: { assetId: "asset-1", fit: "cover" },
      localStyle: {},
    };
    const imageNodeCropped: SlideChildNode = {
      ...imageNodeNoCrop,
      content: {
        ...imageNodeNoCrop.content,
        crop: { top: 4, right: 4, bottom: 4, left: 4 },
      },
    };
    const contentPatches: unknown[] = [];
    let resetCalls = 0;

    routeContextToolbarImageCropToggle({
      selectedNode: imageNodeNoCrop,
      onUpdateSelectedContent: (patch) => contentPatches.push(patch),
      onResetImageCrop: () => {
        resetCalls += 1;
      },
    });
    routeContextToolbarImageCropToggle({
      selectedNode: imageNodeCropped,
      onUpdateSelectedContent: (patch) => contentPatches.push(patch),
      onResetImageCrop: () => {
        resetCalls += 1;
      },
    });
    routeContextToolbarImageFit({
      fit: "contain",
      onUpdateSelectedContent: (patch) => contentPatches.push(patch),
    });

    assert.deepEqual(contentPatches, [
      { crop: { top: 8, right: 8, bottom: 8, left: 8 } },
      { fit: "contain" },
    ]);
    assert.equal(resetCalls, 1);
  });

  test("routes visual, connector, and table controls with expected callback payloads", () => {
    const visualNode: SlideChildNode = {
      id: "visual-1",
      type: "visual",
      role: "visual",
      layout: { frame: { x: 0, y: 0, w: 10, h: 10 }, zIndex: 1 },
      content: { visualId: "v1", transparentBackground: false },
      localStyle: { visual: { styleThemeId: "default" } },
    };
    const connectorNode: SlideChildNode = {
      id: "connector-1",
      type: "connector",
      role: "connector",
      layout: { frame: { x: 0, y: 0, w: 10, h: 10 }, zIndex: 1 },
      content: {
        from: { kind: "point", point: { x: 0, y: 0 } },
        to: { kind: "point", point: { x: 10, y: 10 } },
        routing: "straight",
      },
      localStyle: { connector: { endArrow: "arrow" } },
    };
    const tableNode: SlideChildNode = {
      id: "table-1",
      type: "table",
      role: "table",
      layout: { frame: { x: 0, y: 0, w: 20, h: 10 }, zIndex: 1 },
      content: {
        columns: [
          { id: "c1", label: "A" },
          { id: "c2", label: "B" },
        ],
        rows: [
          { id: "r1", cells: [{ text: "1" }, { text: "2" }] },
          { id: "r2", cells: [{ text: "3" }, { text: "4" }] },
        ],
        header: true,
      },
      localStyle: {},
    };

    const contentPatches: unknown[] = [];
    const stylePatches: unknown[] = [];

    routeContextToolbarVisualBackgroundToggle({
      selectedNode: visualNode,
      onUpdateSelectedContent: (patch) => contentPatches.push(patch),
    });
    routeContextToolbarVisualThemeChange({
      selectedNode: visualNode,
      styleThemeId: "accent",
      onUpdateSelectedLocalStyle: (patch) => stylePatches.push(patch),
    });
    routeContextToolbarConnectorRouting({
      routing: "elbow",
      onUpdateSelectedContent: (patch) => contentPatches.push(patch),
    });
    routeContextToolbarConnectorStrokeColor({
      color: "#0f172a",
      connectorStrokeWidth: 2.5,
      onUpdateSelectedLocalStyle: (patch) => stylePatches.push(patch),
    });
    routeContextToolbarConnectorStrokeWidth({
      widthPt: 3,
      connectorStrokeColor: "#334155",
      onUpdateSelectedLocalStyle: (patch) => stylePatches.push(patch),
    });
    routeContextToolbarConnectorArrow({
      selectedNode: connectorNode,
      edge: "startArrow",
      value: "filled",
      onUpdateSelectedLocalStyle: (patch) => stylePatches.push(patch),
    });
    routeContextToolbarTableHeaderToggle({
      selectedNode: tableNode,
      onUpdateSelectedContent: (patch) => contentPatches.push(patch),
    });
    routeContextToolbarOpacity({
      value: 75,
      onUpdateSelectedLocalStyle: (patch) => stylePatches.push(patch),
    });

    assert.deepEqual(contentPatches, [
      { transparentBackground: true },
      { routing: "elbow" },
      { header: false },
    ]);
    assert.deepEqual(stylePatches, [
      { visual: { styleThemeId: "accent" } },
      { connector: { stroke: { color: "#0f172a", widthPt: 2.5 } } },
      { connector: { stroke: { color: "#334155", widthPt: 3 } } },
      { connector: { endArrow: "arrow", startArrow: "filled" } },
      { opacity: 0.75 },
    ]);

    const withAddedRow = tableWithAddedRow(tableNode);
    const withAddedColumn = tableWithAddedColumn(tableNode);
    const withDeletedRow = tableWithDeletedLastRow(tableNode);
    const withDeletedColumn = tableWithDeletedLastColumn(tableNode);
    assert.equal(withAddedRow.rows.length, 3);
    assert.equal(withAddedColumn.columns.length, 3);
    assert.equal(withDeletedRow.rows.length, 1);
    assert.equal(withDeletedColumn.columns.length, 1);
  });

  test("routes arrange, lock/hide, decoration, and slide-level actions", () => {
    const alignCalls: string[] = [];
    const distributeCalls: string[] = [];
    const matchCalls: string[] = [];
    const layoutPatches: unknown[] = [];
    const attributePatches: unknown[] = [];
    const slideStylePatches: unknown[] = [];
    let deleteCalls = 0;
    let detachCalls = 0;

    routeContextToolbarRotation({
      rotation: 30,
      delta: -15,
      onUpdateSelectedLayout: (patch) => layoutPatches.push(patch),
    });
    routeContextToolbarAlign({
      mode: "left",
      onAlignSelection: (mode) => alignCalls.push(mode),
    });
    routeContextToolbarDistribute({
      mode: "horizontal",
      onDistributeSelection: (mode) => distributeCalls.push(mode),
    });
    routeContextToolbarMatchSize({
      mode: "both",
      onMatchSize: (mode) => matchCalls.push(mode),
    });
    routeContextToolbarLockToggle({
      selectedNode: {
        id: "shape-1",
        type: "shape",
        role: "card",
        layout: { frame: { x: 0, y: 0, w: 10, h: 10 }, zIndex: 1 },
        content: {
          shape: "rect",
          text: { paragraphs: [{ id: "p1", text: "Card" }] },
        },
        localStyle: {},
      },
      onUpdateSelectedAttributes: (patch) => attributePatches.push(patch),
    });
    routeContextToolbarHideSelection({
      onUpdateSelectedAttributes: (patch) => attributePatches.push(patch),
    });
    routeContextToolbarSlideBackground({
      color: "#111827",
      onUpdateSlideLocalStyle: (patch) => slideStylePatches.push(patch),
    });

    const deleted = routeContextToolbarDeleteSlide({
      canDeleteSlide: true,
      onDeleteSlide: () => {
        deleteCalls += 1;
      },
    });
    const skippedDelete = routeContextToolbarDeleteSlide({
      canDeleteSlide: false,
      onDeleteSlide: () => {
        deleteCalls += 1;
      },
    });
    routeContextToolbarDetachDecoration({
      onDetachDecoration: () => {
        detachCalls += 1;
      },
    });

    assert.deepEqual(layoutPatches, [{ rotation: 15 }]);
    assert.deepEqual(alignCalls, ["left"]);
    assert.deepEqual(distributeCalls, ["horizontal"]);
    assert.deepEqual(matchCalls, ["both"]);
    assert.deepEqual(attributePatches, [{ locked: true }, { hidden: true }]);
    assert.deepEqual(slideStylePatches, [
      { slide: { background: { type: "solid", color: "#111827" } } },
    ]);
    assert.equal(deleted, true);
    assert.equal(skippedDelete, false);
    assert.equal(deleteCalls, 1);
    assert.equal(detachCalls, 1);
  });
});
