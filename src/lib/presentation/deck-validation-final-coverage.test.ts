import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { safeParseDeck } from "./deck-schema";
import type { Deck, SlideTemplate } from "./deck-core";
import { executeCommand } from "./slide-commands";
import { resolveThemePackageTemplateId } from "./theme-packages";

type TemplateRecord = Record<string, unknown> & {
  elements: Record<string, unknown>[];
};

function textElement(id = "text-1"): Record<string, unknown> {
  return {
    id,
    kind: "text",
    role: "body",
    zIndex: 0,
    box: { x: 0, y: 0, w: 20, h: 10 },
    content: { kind: "text", text: "Hello", paragraphs: [{ text: "Hello" }] },
  };
}

function master(id: string, elements: Record<string, unknown>[] = []) {
  return { id, name: id, elements };
}

function baseDeck(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 6,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    masters: [master("master-default")],
    defaultMasterId: "master-default",
    slides: [
      {
        id: "slide-1",
        index: 0,
        title: "Slide",
        elements: [],
      },
    ],
    ...overrides,
  };
}

function validTemplate(
  overrides: Record<string, unknown> = {},
): TemplateRecord {
  return {
    id: "template-1",
    name: "Template",
    category: "content",
    elements: [
      {
        id: "template-title",
        kind: "text",
        role: "title",
        box: { x: 5, y: 5, w: 80, h: 10 },
        contentDefaults: { kind: "text", text: "Title" },
      },
    ],
    ...overrides,
  };
}

function assertParseError(input: unknown, pattern: RegExp): void {
  const result = safeParseDeck(input);
  assert.equal(result.success, false);
  if (!result.success) assert.match(result.error, pattern);
}

describe("deck validation final coverage", () => {
  test("safeParseDeck rejects remaining deck-level core branches", () => {
    const cases: Array<[unknown, RegExp]> = [
      [null, /Deck must be an object/],
      [baseDeck({ schemaVersion: 6.5 }), /schemaVersion must be an integer/],
      [baseDeck({ schemaVersion: 5 }), /is not supported/],
      [baseDeck({ canvas: "wide" }), /Deck\.canvas must be an object/],
      [
        baseDeck({ canvas: { format: "cinema", extra: true } }),
        /Deck\.canvas\.extra/,
      ],
      [baseDeck({ design: "default" }), /Deck\.design must be an object/],
      [
        baseDeck({ design: { themeId: "" } }),
        /themeId must be a non-empty string/,
      ],
      [
        baseDeck({ design: { themeId: "default", themeOverrides: null } }),
        /themeOverrides must be an object/,
      ],
      [baseDeck({ masters: "bad" }), /Deck\.masters must be an array/],
      [
        baseDeck({ defaultMasterId: "" }),
        /defaultMasterId must be a non-empty string/,
      ],
      [baseDeck({ slides: "bad" }), /Deck\.slides must be an array/],
      [
        baseDeck({ customTemplates: "bad" }),
        /customTemplates must be an array/,
      ],
      [baseDeck({ deckContentHash: 7 }), /deckContentHash must be a string/],
    ];

    for (const [input, pattern] of cases) {
      assertParseError(input, pattern);
    }
  });

  test("safeParseDeck validates custom template residual failures", () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ source: "legacy" }, /source must be one of/],
      [{ semanticKind: "" }, /semanticKind must be a non-empty string/],
      [{ layoutFamily: "" }, /layoutFamily must be a non-empty string/],
      [{ styleMode: "fluid" }, /styleMode must be one of/],
      [{ accepts: ["title", ""] }, /accepts must be an array/],
      [{ capacity: null }, /capacity must be an object/],
      [{ bindings: [null] }, /bindings must be an array of objects/],
      [{ elements: [null] }, /elements\[0\] must be an object/],
      [
        {
          elements: [
            { ...validTemplate().elements![0], contentDefaults: null },
          ],
        },
        /contentDefaults must be an object/,
      ],
      [
        { elements: [{ ...validTemplate().elements![0], opacity: "opaque" }] },
        /opacity must be a finite number/,
      ],
      [
        { elements: [{ ...validTemplate().elements![0], rotation: "90" }] },
        /rotation must be a finite number/,
      ],
      [
        { elements: [{ ...validTemplate().elements![0], name: "" }] },
        /name must be a non-empty string/,
      ],
    ];

    for (const [overrides, pattern] of cases) {
      assertParseError(
        baseDeck({ customTemplates: [validTemplate(overrides)] }),
        pattern,
      );
    }
  });

  test("safeParseDeck preserves valid optional template, slide, and hash fields", () => {
    const result = safeParseDeck(
      baseDeck({
        deckContentHash: "hash-123",
        slides: [
          {
            id: "slide-1",
            index: 0,
            title: "Slide",
            notes: "Notes",
            masterId: "master-default",
            templateId: "template-1",
            source: { documentId: "doc-1" },
            elements: [textElement()],
          },
        ],
        customTemplates: [
          validTemplate({
            source: "custom",
            semanticKind: "detail",
            layoutFamily: "single-column",
            styleMode: "theme-aware",
            accepts: ["title"],
            capacity: { maxItems: 1 },
            bindings: [{ slot: "title", elementId: "template-title" }],
            defaultMasterId: "master-default",
            slideDesignDefaults: {
              background: { type: "solid", color: { value: "#ffffff" } },
            },
          }),
        ],
      }),
    );

    assert.equal(result.success, true, !result.success ? result.error : "");
    if (!result.success) return;
    assert.equal(result.data.deckContentHash, "hash-123");
    assert.equal(result.data.slides[0]?.masterId, "master-default");
    assert.equal(result.data.customTemplates?.[0]?.source, "custom");
  });

  test("presentation command executor covers remaining failure and removal branches", () => {
    const deck = baseDeck({
      masters: [master("master-default"), master("master-alt")],
      defaultMasterId: "master-default",
      slides: [
        {
          id: "slide-1",
          index: 0,
          title: "Slide",
          masterId: "master-alt",
          elements: [textElement("existing-title")],
        },
      ],
      customTemplates: [
        validTemplate({
          id: "custom-template",
          defaultMasterId: "master-alt",
          slideDesignDefaults: {
            background: { type: "solid", color: { value: "#eeeeee" } },
          },
        }),
      ],
    }) as unknown as Deck;

    const missingPackage = executeCommand(deck, {
      type: "APPLY_THEME_PACKAGE",
      packageId: "missing-package",
    });
    assert.equal(missingPackage.ok, false);

    const resetOverrides = executeCommand(
      {
        ...deck,
        design: {
          themeId: "default",
          themeOverrides: { tokenSet: { id: "custom", name: "Custom" } },
        },
      } as unknown as Deck,
      { type: "UPDATE_THEME_OVERRIDES", patch: {}, reset: true },
    );
    assert.equal(resetOverrides.ok, true);
    assert.equal(
      resetOverrides.patches[0]?.deckFields?.resetThemeOverrides,
      true,
    );

    const patchedOverrides = executeCommand(deck, {
      type: "UPDATE_THEME_OVERRIDES",
      patch: { colors: { accent: "#123456" } },
    });
    assert.equal(patchedOverrides.ok, true);
    assert.equal(
      patchedOverrides.patches[0]?.op,
      "presentation.update_theme_overrides",
    );

    const canvasFormat = executeCommand(deck, {
      type: "SET_CANVAS_FORMAT",
      format: "4:3",
    });
    assert.equal(canvasFormat.ok, true);
    assert.equal(canvasFormat.deck.canvas?.format, "4:3");

    const duplicateMaster = executeCommand(deck, {
      type: "CREATE_MASTER",
      master: master("master-default") as never,
    });
    assert.equal(duplicateMaster.ok, false);

    const deleteDefault = executeCommand(deck, {
      type: "DELETE_MASTER",
      masterId: "master-default",
    });
    assert.equal(deleteDefault.ok, false);

    const deleteAlt = executeCommand(deck, {
      type: "DELETE_MASTER",
      masterId: "master-alt",
    });
    assert.equal(deleteAlt.ok, true);
    assert.equal(deleteAlt.deck.slides[0]?.masterId, undefined);

    const removedMaster = executeCommand(deck, {
      type: "SET_SLIDE_MASTER",
      slideId: "slide-1",
      masterId: undefined,
    });
    assert.equal(removedMaster.ok, true);
    assert.equal(removedMaster.deck.slides[0]?.masterId, undefined);

    const missingSlideForMaster = executeCommand(deck, {
      type: "SET_SLIDE_MASTER",
      slideId: "missing-slide",
      masterId: "master-default",
    });
    assert.equal(missingSlideForMaster.ok, false);

    const invalidMasterElementPatch = executeCommand(
      {
        ...deck,
        masters: [
          {
            id: "master-default",
            name: "Default",
            elements: [
              {
                ...textElement("footer-master"),
                role: "footer",
                layer: "foreground",
                locked: true,
                masterChromeKind: "footer",
              },
            ],
          },
        ],
      } as unknown as Deck,
      {
        type: "UPDATE_MASTER_ELEMENT",
        masterId: "master-default",
        elementId: "footer-master",
        patch: { masterChromeKind: "logo" } as never,
      },
    );
    assert.equal(invalidMasterElementPatch.ok, false);

    const missingAfterSlide = executeCommand(deck, {
      type: "ADD_SLIDE_FROM_TEMPLATE",
      templateId: "custom-template",
      afterSlideId: "missing-slide",
    });
    assert.equal(missingAfterSlide.ok, false);

    const replaced = executeCommand(deck, {
      type: "APPLY_SLIDE_TEMPLATE",
      slideId: "slide-1",
      templateId: "custom-template",
      mode: "replace",
    });
    assert.equal(replaced.ok, true);
    assert.equal(
      replaced.deck.slides[0]?.elements?.[0]?.id !== "existing-title",
      true,
    );

    const reservedTemplateId = resolveThemePackageTemplateId(
      "terra",
      "content",
    );
    const createReserved = executeCommand(deck, {
      type: "CREATE_CUSTOM_TEMPLATE",
      template: { ...validTemplate(), id: reservedTemplateId } as SlideTemplate,
    });
    assert.equal(createReserved.ok, false);

    const createDuplicate = executeCommand(deck, {
      type: "CREATE_CUSTOM_TEMPLATE",
      template: { ...validTemplate(), id: "custom-template" } as SlideTemplate,
    });
    assert.equal(createDuplicate.ok, false);

    const updateReserved = executeCommand(deck, {
      type: "UPDATE_CUSTOM_TEMPLATE",
      templateId: reservedTemplateId,
      patch: { name: "Nope" },
    });
    assert.equal(updateReserved.ok, false);

    const deleteMissing = executeCommand(deck, {
      type: "DELETE_CUSTOM_TEMPLATE",
      templateId: "missing-template",
    });
    assert.equal(deleteMissing.ok, false);
  });
});
