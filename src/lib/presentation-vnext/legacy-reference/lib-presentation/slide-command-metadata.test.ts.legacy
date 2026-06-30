import assert from "node:assert/strict";
import { test } from "node:test";

import type { CommandTarget } from "@/lib/commands/envelope-core";
import type { SlideCommand } from "./slide-command-contracts";
import {
  canCoalesceSlideCommands,
  getSlideCommandMetadata,
  mergeCoalescedSlideCommands,
  validateDeckCommandPayload,
} from "./slide-command-metadata";

const TARGET: CommandTarget = {
  surface: "deck",
  slideId: "s1",
  elementId: "e1",
};

function validationErrors(payload: unknown, target = TARGET): string[] {
  const errors: string[] = [];
  validateDeckCommandPayload(payload, target, errors);
  return errors;
}

test("validateDeckCommandPayload rejects non-object and unsupported command payloads", () => {
  assert.deepEqual(validationErrors(null), [
    "Deck command payloads must be objects.",
  ]);
  assert.deepEqual(validationErrors({ type: "NOPE" }), [
    "payload.type must be a supported SlideCommand.",
  ]);
  assert.deepEqual(
    validationErrors({
      type: "ADD_SLIDE",
      commandId: "",
      coalesceKey: "",
      afterSlideId: "",
    }),
    [
      "payload.commandId must be a non-empty string when provided.",
      "payload.coalesceKey must be a non-empty string when provided.",
      "payload.afterSlideId must be a non-empty string or null.",
    ],
  );
});

test("slide command metadata lookup exposes operation, target, and affected ids", () => {
  const metadata = getSlideCommandMetadata("UPDATE_ELEMENT");
  assert.ok(metadata);
  assert.equal(metadata.op, "element.update");
  assert.deepEqual(metadata.target, {
    slideId: "required",
    elementId: "required",
  });
  assert.deepEqual(
    metadata.affectedIds({
      type: "UPDATE_ELEMENT",
      slideId: "s1",
      elementId: "e1",
      patch: {},
    } as SlideCommand),
    { slideIds: ["s1"], elementIds: ["e1"] },
  );
  assert.equal(getSlideCommandMetadata("UNKNOWN"), undefined);
});

test("affected ids include multi-element commands and ignore malformed ids", () => {
  const metadata = getSlideCommandMetadata("REMOVE_ELEMENTS");
  assert.ok(metadata);
  assert.deepEqual(
    metadata.affectedIds({
      type: "REMOVE_ELEMENTS",
      slideId: "s1",
      elementIds: ["e1", 2, "e2"],
    } as unknown as SlideCommand),
    { slideIds: ["s1"], elementIds: ["e1", "e2"] },
  );
  assert.deepEqual(
    metadata.affectedIds({ type: "REMOVE_ELEMENTS" } as SlideCommand),
    { slideIds: [], elementIds: [] },
  );
});

test("payload validation covers slide, element, master, template, and source commands", () => {
  const cases: Array<[unknown, RegExp]> = [
    [{ type: "REORDER_SLIDE", slideId: "", toIndex: 1.5 }, /toIndex/],
    [{ type: "UPDATE_SLIDE", slideId: "", patch: null }, /patch/],
    [{ type: "UPDATE_SLIDE_NOTES", notes: 42 }, /notes/],
    [{ type: "ADD_ELEMENT", slideId: "", element: null }, /element/],
    [
      { type: "UPDATE_ELEMENT_CONTENT", slideId: "s1", elementId: "e1" },
      /content or payload.role/,
    ],
    [
      {
        type: "UPDATE_ELEMENT_DESIGN_OVERRIDES",
        slideId: "s1",
        elementId: "e1",
        designOverrides: null,
      },
      /designOverrides/,
    ],
    [{ type: "MOVE_SLIDE", slideIndex: 1.2, direction: "down" }, /direction/],
    [
      { type: "INSERT_TEMPLATE_SLIDE", slide: null, afterIndex: 1.2 },
      /afterIndex/,
    ],
    [{ type: "REMOVE_ELEMENTS", slideId: "s1", elementIds: [1] }, /elementIds/],
    [{ type: "UNGROUP_ELEMENTS", slideId: "s1", groupId: "" }, /groupId/],
    [
      { type: "NUDGE_ELEMENTS", slideId: "s1", elementIds: [], dx: "x", dy: 1 },
      /dx/,
    ],
    [
      { type: "SET_ELEMENT_BOXES", slideId: "s1", boxesById: { e1: { x: 0 } } },
      /w/,
    ],
    [
      { type: "SET_ELEMENT_BOXES", slideId: "s1", boxesById: { e1: null } },
      /boxesById\.e1 must be an object/,
    ],
    [
      { type: "SET_ELEMENT_PATCHES", slideId: "s1", patchesById: null },
      /patchesById/,
    ],
    [
      {
        type: "SET_ELEMENT_HIDDEN",
        slideId: "s1",
        elementId: "e1",
        hidden: "yes",
      },
      /hidden/,
    ],
    [
      {
        type: "MOVE_ELEMENT_ZORDER",
        slideId: "s1",
        elementId: "e1",
        direction: "left",
      },
      /direction/,
    ],
    [
      { type: "RENAME_ELEMENT", slideId: "s1", elementId: "e1", name: 1 },
      /name/,
    ],
    [
      {
        type: "REORDER_ELEMENT",
        slideId: "s1",
        elementId: "e1",
        targetElementId: "",
      },
      /targetElementId/,
    ],
    [{ type: "SET_PRESENTATION_THEME", themeId: "" }, /themeId/],
    [{ type: "UPDATE_THEME_OVERRIDES", patch: null, reset: "no" }, /reset/],
    [{ type: "SET_CANVAS_FORMAT", format: "" }, /format/],
    [{ type: "CREATE_MASTER", master: null }, /master/],
    [{ type: "UPDATE_MASTER", masterId: "", patch: null }, /masterId/],
    [{ type: "DELETE_MASTER", masterId: "" }, /masterId/],
    [{ type: "SET_SLIDE_MASTER", slideId: "s1", masterId: "" }, /masterId/],
    [
      {
        type: "UPDATE_MASTER_ELEMENT",
        masterId: "",
        elementId: "",
        patch: null,
      },
      /patch/,
    ],
    [
      { type: "ADD_SLIDE_FROM_TEMPLATE", templateId: "", afterSlideId: "" },
      /templateId/,
    ],
    [{ type: "APPLY_SLIDE_TEMPLATE", slideId: "", templateId: "" }, /slideId/],
    [{ type: "CREATE_CUSTOM_TEMPLATE", template: null }, /template/],
    [
      { type: "UPDATE_CUSTOM_TEMPLATE", templateId: "", patch: null },
      /templateId/,
    ],
    [{ type: "DELETE_CUSTOM_TEMPLATE", templateId: "" }, /templateId/],
    [
      { type: "SET_SLIDE_BACKGROUND", slideId: "s1", background: 1 },
      /background/,
    ],
    [
      {
        type: "SET_SLIDE_BACKGROUND_GRADIENT",
        slideId: "s1",
        gradient: { from: "", to: "", angle: "x" },
      },
      /gradient.from/,
    ],
    [
      {
        type: "SET_SLIDE_BACKGROUND_GRADIENT",
        slideId: "s1",
        gradient: "blue",
      },
      /gradient must be an object or undefined/,
    ],
    [{ type: "SET_SLIDE_BACKGROUND_IMAGE", slideId: "s1", image: 1 }, /image/],
    [
      {
        type: "SET_SLIDE_BACKGROUND_ASSET",
        slideId: "s1",
        opts: "asset",
      },
      /opts must be an object or undefined/,
    ],
    [
      {
        type: "SET_SLIDE_BACKGROUND_ASSET",
        slideId: "s1",
        opts: { url: "", assetId: "" },
      },
      /assetId/,
    ],
    [{ type: "SET_SLIDE_ACCENT", slideId: "s1", accent: 1 }, /accent/],
    [
      {
        type: "UPDATE_ELEMENT_SOURCE",
        slideId: "s1",
        elementId: "e1",
        source: {
          documentId: "",
          blockId: "",
          linkedAt: "",
          contentHash: "",
          unlinked: "no",
          blockKind: "other",
          extra: true,
        },
      },
      /blockKind/,
    ],
  ];

  for (const [payload, expected] of cases) {
    assert.match(
      validationErrors(payload).join("\n"),
      expected,
      JSON.stringify(payload),
    );
  }
});

test("payload validation reports specific background, nudge, and box container errors", () => {
  assert.match(
    validationErrors({
      type: "SET_SLIDE_BACKGROUND_GRADIENT",
      slideId: "",
    }).join("\n"),
    /payload\.slideId/,
  );
  assert.match(
    validationErrors({
      type: "NUDGE_ELEMENTS",
      slideId: "",
      elementIds: [],
      dx: 1,
      dy: "down",
    }).join("\n"),
    /payload\.slideId/,
  );
  assert.match(
    validationErrors({
      type: "SET_ELEMENT_BOXES",
      slideId: "s1",
      boxesById: null,
    }).join("\n"),
    /boxesById must be an object/,
  );
});

test("payload validation reports invalid notes and ungroup slide ids", () => {
  assert.deepEqual(
    validationErrors({ type: "UPDATE_SLIDE_NOTES", slideId: "s1", notes: 1 }),
    ["payload.notes must be a string."],
  );
  assert.deepEqual(
    validationErrors(
      {
        type: "UNGROUP_ELEMENTS",
        slideId: "",
        groupId: "group-1",
      },
      { surface: "deck" },
    ),
    ["payload.slideId must be a non-empty string."],
  );
});

test("payload validation accepts optional background, asset, and source branches", () => {
  const validPayloads: unknown[] = [
    { type: "ADD_SLIDE", afterSlideId: "s1" },
    { type: "ADD_SLIDE", afterSlideId: null },
    { type: "UPDATE_ELEMENT", slideId: "s1", elementId: "e1", patch: {} },
    {
      type: "UPDATE_ELEMENT_CONTENT",
      slideId: "s1",
      elementId: "e1",
      role: "title",
    },
    { type: "MOVE_SLIDE", slideIndex: 1, direction: -1 },
    {
      type: "ALIGN_ELEMENTS",
      slideId: "s1",
      elementIds: ["e1", "e2"],
      mode: "left",
    },
    { type: "UNGROUP_ELEMENTS", slideId: "s1", groupId: "group-1" },
    { type: "UPDATE_THEME_OVERRIDES", patch: {}, reset: false },
    { type: "SET_SLIDE_BACKGROUND", slideId: "s1", background: undefined },
    {
      type: "SET_SLIDE_BACKGROUND_GRADIENT",
      slideId: "s1",
      gradient: undefined,
    },
    { type: "SET_SLIDE_BACKGROUND_IMAGE", slideId: "s1", image: undefined },
    { type: "SET_SLIDE_BACKGROUND_ASSET", slideId: "s1", opts: undefined },
    { type: "SET_SLIDE_ACCENT", slideId: "s1", accent: undefined },
    {
      type: "UPDATE_ELEMENT_SOURCE",
      slideId: "s1",
      elementId: "e1",
      unlink: true,
    },
    {
      type: "UPDATE_ELEMENT_SOURCE",
      slideId: "s1",
      elementId: "e1",
      unlink: false,
      source: {
        documentId: "doc-1",
        blockId: "block-1",
        contentHash: "hash-1",
        linkedAt: "2026-01-01T00:00:00.000Z",
        unlinked: false,
        blockKind: "visual",
      },
    },
    {
      type: "SET_SLIDE_BACKGROUND_GRADIENT",
      slideId: "s1",
      gradient: { from: "#000000", to: "#ffffff", angle: 90 },
    },
    {
      type: "SET_SLIDE_BACKGROUND_ASSET",
      slideId: "s1",
      opts: { url: "/asset.png", assetId: "asset-1" },
    },
  ];

  for (const payload of validPayloads) {
    assert.deepEqual(validationErrors(payload), [], JSON.stringify(payload));
  }
});

test("payload validation reports all required fields for focused command branches", () => {
  const cases: Array<[unknown, string[]]> = [
    [
      { type: "UPDATE_ELEMENT_CONTENT", slideId: "", elementId: "", role: "" },
      [
        "payload.slideId must be a non-empty string.",
        "payload.elementId must be a non-empty string.",
        "payload.role must be a non-empty string when provided.",
      ],
    ],
    [
      { type: "UPDATE_ELEMENT_DESIGN_OVERRIDES", slideId: "", elementId: "" },
      [
        "payload.slideId must be a non-empty string.",
        "payload.elementId must be a non-empty string.",
        "payload.designOverrides must be an object.",
      ],
    ],
    [
      { type: "REMOVE_ELEMENT", slideId: "", elementId: "" },
      [
        "payload.slideId must be a non-empty string.",
        "payload.elementId must be a non-empty string.",
      ],
    ],
    [
      { type: "SET_ELEMENT_LOCKED", slideId: "", elementId: "", locked: "yes" },
      [
        "payload.slideId must be a non-empty string.",
        "payload.elementId must be a non-empty string.",
        "payload.locked must be a boolean.",
      ],
    ],
    [
      {
        type: "NUDGE_ELEMENTS",
        slideId: "",
        elementIds: [1],
        dx: "left",
        dy: "down",
      },
      [
        "payload.slideId must be a non-empty string.",
        "payload.elementIds must be an array of strings.",
        "payload.dx must be a finite number.",
        "payload.dy must be a finite number.",
      ],
    ],
    [
      { type: "ALIGN_ELEMENTS", slideId: "", elementIds: [1], mode: "" },
      [
        "payload.slideId must be a non-empty string.",
        "payload.elementIds must be an array of strings.",
        "payload.mode must be a non-empty string.",
      ],
    ],
    [
      { type: "UNGROUP_ELEMENTS", slideId: "", groupId: "" },
      [
        "payload.slideId must be a non-empty string.",
        "payload.groupId must be a non-empty string.",
      ],
    ],
    [
      { type: "UPDATE_THEME_OVERRIDES", patch: null, reset: "yes" },
      [
        "payload.patch must be an object.",
        "payload.reset must be a boolean when provided.",
      ],
    ],
    [
      {
        type: "UPDATE_ELEMENT_SOURCE",
        slideId: "",
        elementId: "",
        unlink: "no",
        source: null,
      },
      [
        "payload.slideId must be a non-empty string.",
        "payload.elementId must be a non-empty string.",
        "payload.unlink must be a boolean when provided.",
        "payload.source must be an object.",
      ],
    ],
  ];

  for (const [payload, expected] of cases) {
    assert.deepEqual(
      validationErrors(payload, { surface: "deck" }),
      expected,
      JSON.stringify(payload),
    );
  }
});

test("slide command metadata is registered for every command type", () => {
  const expectedOps: Array<[SlideCommand["type"], string]> = [
    ["SET_DEFAULT_MASTER", "master.set_default"],
    ["UPDATE_MASTER_ELEMENT", "master.element.update"],
    ["APPLY_SLIDE_TEMPLATE", "slide.apply_template"],
    ["SET_SLIDE_BACKGROUND_ASSET", "slide.set_background_asset"],
    ["UPDATE_ELEMENT_SOURCE", "element.update"],
    ["REMOVE_SOURCE_ELEMENT", "element.remove"],
  ];

  for (const [type, op] of expectedOps) {
    const metadata = getSlideCommandMetadata(type);
    assert.ok(metadata, `${type} should have metadata`);
    assert.equal(metadata.op, op);
    assert.equal(metadata.type, type);
  }
});

test("target validation catches mismatched slide and element ids", () => {
  assert.deepEqual(
    validationErrors(
      {
        type: "UPDATE_ELEMENT",
        slideId: "other",
        elementId: "different",
        patch: {},
      },
      TARGET,
    ).slice(-2),
    [
      "target.slideId must match payload.slideId.",
      "target.elementId must match payload.elementId.",
    ],
  );
});

test("coalescing only allows compatible slide or element commands", () => {
  const a = {
    type: "UPDATE_ELEMENT",
    slideId: "s1",
    elementId: "e1",
    patch: { a: 1 },
    coalesceKey: "drag",
  } as unknown as SlideCommand;
  const b = {
    type: "UPDATE_ELEMENT",
    slideId: "s1",
    elementId: "e1",
    patch: { b: 2 },
    coalesceKey: "drag",
  } as unknown as SlideCommand;

  assert.equal(canCoalesceSlideCommands(a, b), true);
  assert.equal(
    canCoalesceSlideCommands(
      {
        type: "UPDATE_SLIDE",
        slideId: "s1",
        patch: { a: 1 },
        coalesceKey: "edit",
      } as unknown as SlideCommand,
      {
        type: "UPDATE_SLIDE",
        slideId: "s1",
        patch: { b: 2 },
        coalesceKey: "edit",
      } as unknown as SlideCommand,
    ),
    true,
  );
  assert.equal(
    canCoalesceSlideCommands(
      { ...a, coalesceKey: undefined } as SlideCommand,
      b,
    ),
    false,
  );
  assert.equal(
    canCoalesceSlideCommands({ ...a, slideId: "other" } as SlideCommand, b),
    false,
  );
  assert.equal(
    canCoalesceSlideCommands(
      { ...a, type: "NOPE" } as unknown as SlideCommand,
      { ...b, type: "NOPE" } as unknown as SlideCommand,
    ),
    false,
  );
  assert.equal(
    canCoalesceSlideCommands(a, { ...b, elementId: "e2" } as SlideCommand),
    false,
  );
  assert.equal(
    canCoalesceSlideCommands(
      { ...a, type: "REMOVE_ELEMENT" } as SlideCommand,
      { ...b, type: "REMOVE_ELEMENT" } as SlideCommand,
    ),
    false,
  );
});

test("mergeCoalescedSlideCommands merges command-specific payloads", () => {
  const pairs: Array<[SlideCommand, SlideCommand, Partial<SlideCommand>]> = [
    [
      { type: "UPDATE_SLIDE", slideId: "s1", patch: { a: 1 } } as SlideCommand,
      { type: "UPDATE_SLIDE", slideId: "s1", patch: { b: 2 } } as SlideCommand,
      { patch: { a: 1, b: 2 } } as Partial<SlideCommand>,
    ],
    [
      {
        type: "UPDATE_ELEMENT_CONTENT",
        slideId: "s1",
        elementId: "e1",
        content: { old: true },
      } as unknown as SlideCommand,
      {
        type: "UPDATE_ELEMENT_CONTENT",
        slideId: "s1",
        elementId: "e1",
        role: "title",
      } as unknown as SlideCommand,
      { content: { old: true }, role: "title" } as Partial<SlideCommand>,
    ],
    [
      {
        type: "UPDATE_ELEMENT_DESIGN_OVERRIDES",
        slideId: "s1",
        elementId: "e1",
        designOverrides: { a: 1 },
      } as unknown as SlideCommand,
      {
        type: "UPDATE_ELEMENT_DESIGN_OVERRIDES",
        slideId: "s1",
        elementId: "e1",
        designOverrides: { b: 2 },
      } as unknown as SlideCommand,
      { designOverrides: { a: 1, b: 2 } } as Partial<SlideCommand>,
    ],
    [
      { type: "UPDATE_SLIDE_TITLE", slideId: "s1", title: "A" } as SlideCommand,
      { type: "UPDATE_SLIDE_TITLE", slideId: "s1", title: "B" } as SlideCommand,
      { title: "B" } as Partial<SlideCommand>,
    ],
    [
      { type: "UPDATE_SLIDE_NOTES", slideId: "s1", notes: "A" } as SlideCommand,
      { type: "UPDATE_SLIDE_NOTES", slideId: "s1", notes: "B" } as SlideCommand,
      { notes: "B" } as Partial<SlideCommand>,
    ],
    [
      {
        type: "SET_ELEMENT_BOXES",
        slideId: "s1",
        boxesById: { a: { x: 0, y: 0, w: 1, h: 1 } },
      } as unknown as SlideCommand,
      {
        type: "SET_ELEMENT_BOXES",
        slideId: "s1",
        boxesById: { b: { x: 1, y: 1, w: 1, h: 1 } },
      } as unknown as SlideCommand,
      {
        boxesById: {
          a: { x: 0, y: 0, w: 1, h: 1 },
          b: { x: 1, y: 1, w: 1, h: 1 },
        },
      } as Partial<SlideCommand>,
    ],
    [
      {
        type: "SET_ELEMENT_PATCHES",
        slideId: "s1",
        patchesById: { a: { hidden: true } },
      } as unknown as SlideCommand,
      {
        type: "SET_ELEMENT_PATCHES",
        slideId: "s1",
        patchesById: { b: { locked: true } },
      } as unknown as SlideCommand,
      {
        patchesById: { a: { hidden: true }, b: { locked: true } },
      } as Partial<SlideCommand>,
    ],
  ];

  for (const [a, b, expected] of pairs) {
    assert.deepEqual(mergeCoalescedSlideCommands(a, b), {
      ...a,
      ...expected,
    });
  }

  const remove = { type: "REMOVE_ELEMENT", slideId: "s1", elementId: "e1" };
  const mergedRemove = mergeCoalescedSlideCommands(
    remove as SlideCommand,
    { ...remove, elementId: "e2" } as SlideCommand,
  ) as typeof remove;
  assert.equal(mergedRemove.elementId, "e2");
});
