import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide, SlideElement } from "./deck";
import { applyPatch, executeCommand } from "./slide-commands";
import { safeParseDeck } from "./deck-schema";
import { applyGlobalMasterChromeUpdate } from "./global-master-chrome";
import { resolveThemeTokens } from "./presentation-theme";
import {
  DEFAULT_THEME_PACKAGE_ID,
  THEME_PACKAGE_TEMPLATE_KINDS,
  THEME_PACKAGES,
  getThemePackageTemplateMetadata,
  getThemePackage,
  isThemePackageTemplateId,
  resolveThemePackageId,
  resolveThemePackageTemplateId,
  themePackageTemplateCatalogForAi,
  themePackageTemplateGroupsForUi,
  themePackageTemplatesForDeck,
} from "./theme-packages";
import { buildDeck, buildSlide } from "@/test/builders/deck";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildCommandSlide(id: string, index: number, title = ""): Slide {
  return buildSlide({
    id,
    index,
    title,
    notes: "",
    elements: [],
  });
}

function buildCommandDeck(slideIds: string[]): Deck {
  return buildDeck({
    design: { themeId: "default" },
    slides: slideIds.map((id, i) => buildCommandSlide(id, i, `Slide ${i}`)),
  });
}

// ---------------------------------------------------------------------------
// Issue #400 — SET_PRESENTATION_THEME
// ---------------------------------------------------------------------------

test("SET_PRESENTATION_THEME changes presentation theme and emits patch with deckFields", () => {
  const deck = buildCommandDeck(["s1", "s2"]);
  const result = executeCommand(deck, {
    type: "SET_PRESENTATION_THEME",
    themeId: "ocean",
  });
  assert.equal(result.ok, true);
  assert.equal((result.deck as any).design.themeId, "ocean");
  assert.equal(result.patches[0]!.op, "presentation.set_theme");
  assert.equal(result.patches[0]!.deckFields?.design?.themeId, "ocean");
  // All slide ids are affected
  assert.equal(result.affectedSlideIds.length, 2);
});

test("SET_PRESENTATION_THEME clears theme overrides so built-in theme is visible", () => {
  const deck = {
    ...buildCommandDeck(["s1"]),
    design: {
      themeId: "forest",
      themeOverrides: {
        tokenSet: {
          ...resolveThemeTokens("forest"),
          id: "custom:forest",
          name: "Custom Forest",
          colors: { ...resolveThemeTokens("forest").colors, accent: "#ff0000" },
        },
      },
    },
  };
  const result = executeCommand(deck, {
    type: "SET_PRESENTATION_THEME",
    themeId: "ocean",
  });
  assert.equal(result.ok, true);
  assert.equal((result.deck as any).design.themeId, "ocean");
  assert.equal((result.deck as any).design.themeOverrides, undefined);
});

// ---------------------------------------------------------------------------
// Issue #400 — SET_CANVAS_FORMAT
// ---------------------------------------------------------------------------

test("SET_CANVAS_FORMAT changes slide format and emits patch", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "SET_CANVAS_FORMAT",
    format: "4:3",
  });
  assert.equal(result.ok, true);
  assert.equal((result.deck as any).canvas.format, "4:3");
  assert.equal(result.patches[0]!.op, "canvas.set_format");
  assert.equal(result.patches[0]!.deckFields?.canvas?.format, "4:3");
});

// ---------------------------------------------------------------------------
// Deck masters
// ---------------------------------------------------------------------------

function master(id: string, name = id) {
  return { id, name, elements: [] };
}

function masterTextElement(id: string) {
  return {
    id,
    kind: "text" as const,
    role: "footer",
    masterChromeKind: "footer" as const,
    layer: "foreground" as const,
    locked: true as const,
    box: { x: 5, y: 92, w: 90, h: 5 },
    zIndex: 0,
    content: { kind: "text", text: "Footer", paragraphs: [{ text: "Footer" }] },
    designOverrides: { textStyle: { fontSize: 2, align: "center" } },
  };
}

test("CREATE_MASTER appends a master and patch replay matches", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "CREATE_MASTER",
    master: master("master-alt", "Alt"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.patches[0]!.op, "master.create");
  assert.equal(result.patches[0]!.addedIds?.[0], "master-alt");
  assert.equal((result.deck as any).masters.at(-1).id, "master-alt");
  assert.equal(safeParseDeck(result.deck).success, true);
  assert.deepEqual(applyPatch(deck, result.patches[0]!), result.deck);
});

test("CREATE_MASTER rejects invalid master chrome elements", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "CREATE_MASTER",
    master: {
      id: "master-invalid",
      name: "Invalid",
      elements: [
        {
          ...masterTextElement("me-invalid"),
          masterChromeKind: "logo",
        } as any,
      ],
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error ?? "", /kind must be "image"/);
});

test("UPDATE_MASTER updates deck-owned master chrome", () => {
  const deck = {
    ...buildCommandDeck(["s1"]),
    masters: [master("master-default", "Default")],
  } as Deck;
  const result = executeCommand(deck, {
    type: "UPDATE_MASTER",
    masterId: "master-default",
    patch: {
      name: "Updated",
      background: { type: "solid", color: { value: "#111111" } },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.patches[0]!.op, "master.update");
  assert.equal((result.deck as any).masters[0].name, "Updated");
  assert.equal(safeParseDeck(result.deck).success, true);
});

test("master chrome footer edits preserve package text styling", () => {
  const applied = executeCommand(buildCommandDeck(["s1"]), {
    type: "APPLY_THEME_PACKAGE",
    packageId: "terra",
  });
  assert.equal(applied.ok, true);
  const master = applied.deck.masters![0]!;
  const originalFooter = master.elements.find(
    (element) => element.masterChromeKind === "footer",
  )!;
  const originalTextStyle = (originalFooter as any).designOverrides.textStyle;

  const elements = applyGlobalMasterChromeUpdate(master.elements, {
    kind: "footer",
    state: {
      enabled: true,
      text: "Quarterly update",
      align: "right",
    },
  });
  const nextFooter = elements.find(
    (element) => element.masterChromeKind === "footer",
  )!;

  assert.equal((nextFooter as any).content.text, "Quarterly update");
  assert.deepEqual((nextFooter as any).box, (originalFooter as any).box);
  assert.deepEqual((nextFooter as any).designOverrides.textStyle, {
    ...originalTextStyle,
    align: "right",
  });
});

test("SET_DEFAULT_MASTER and SET_SLIDE_MASTER update master assignments", () => {
  const deck = {
    ...buildCommandDeck(["s1"]),
    masters: [master("master-default"), master("master-alt")],
  } as Deck;
  const defaultResult = executeCommand(deck, {
    type: "SET_DEFAULT_MASTER",
    masterId: "master-alt",
  });
  assert.equal(defaultResult.ok, true);
  assert.equal((defaultResult.deck as any).defaultMasterId, "master-alt");
  assert.equal(defaultResult.patches[0]!.op, "master.set_default");

  const slideResult = executeCommand(defaultResult.deck, {
    type: "SET_SLIDE_MASTER",
    slideId: "s1",
    masterId: "master-default",
  });
  assert.equal(slideResult.ok, true);
  assert.equal((slideResult.deck.slides[0] as any).masterId, "master-default");
  assert.equal(slideResult.patches[0]!.op, "slide.set_master");
});

test("UPDATE_MASTER_ELEMENT patches a locked master element", () => {
  const deck = {
    ...buildCommandDeck(["s1"]),
    masters: [
      {
        id: "master-default",
        name: "Default",
        elements: [masterTextElement("me1")],
      },
    ],
  } as unknown as Deck;
  const result = executeCommand(deck, {
    type: "UPDATE_MASTER_ELEMENT",
    masterId: "master-default",
    elementId: "me1",
    patch: {
      content: { kind: "text", text: "New", paragraphs: [{ text: "New" }] },
    } as never,
  });
  assert.equal(result.ok, true);
  const element = (result.deck as any).masters[0].elements[0];
  assert.equal(element.locked, true);
  assert.equal(element.content.text, "New");
  assert.equal(result.patches[0]!.op, "master.element.update");
  assert.equal(safeParseDeck(result.deck).success, true);
});

test("UPDATE_MASTER_ELEMENT rejects invalid master chrome patches", () => {
  const deck = {
    ...buildCommandDeck(["s1"]),
    masters: [
      {
        id: "master-default",
        name: "Default",
        elements: [masterTextElement("me1")],
      },
    ],
  } as unknown as Deck;
  const result = executeCommand(deck, {
    type: "UPDATE_MASTER_ELEMENT",
    masterId: "master-default",
    elementId: "me1",
    patch: { layer: "background" } as never,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error ?? "", /layer must be "foreground"/);
});

test("DELETE_MASTER removes non-default master and clears slide assignment", () => {
  const deck = {
    ...buildCommandDeck(["s1"]),
    masters: [master("master-default"), master("master-alt")],
    slides: [
      {
        ...buildCommandSlide("s1", 0, "Slide"),
        masterId: "master-alt",
      } as Slide,
    ],
  } as Deck;
  const result = executeCommand(deck, {
    type: "DELETE_MASTER",
    masterId: "master-alt",
  });
  assert.equal(result.ok, true);
  assert.equal((result.deck as any).masters.length, 1);
  assert.equal((result.deck.slides[0] as any).masterId, undefined);
  assert.equal(result.patches[0]!.op, "master.delete");
  assert.equal(result.patches[0]!.removedIds?.[0], "master-alt");
  assert.equal(safeParseDeck(result.deck).success, true);
});

// ---------------------------------------------------------------------------
// Slide templates
// ---------------------------------------------------------------------------

function customTemplate(id = "template-custom") {
  return {
    id,
    name: "Custom",
    category: "content" as const,
    elements: [
      {
        id: "slot-title",
        kind: "text",
        role: "title",
        box: { x: 8, y: 8, w: 84, h: 14 },
        contentDefaults: {
          kind: "text",
          text: "Custom title",
          paragraphs: [{ text: "Custom title" }],
        },
      },
    ],
  };
}

test("APPLY_THEME_PACKAGE installs package assets and preserves user templates", () => {
  const slideElement = {
    id: "keep-shape",
    kind: "shape",
    role: "background",
    box: { x: 10, y: 10, w: 20, h: 20 },
    zIndex: 0,
    content: { kind: "shape", shape: "rect" },
    designOverrides: { fill: { value: "#ff0000" } },
  } as unknown as SlideElement;
  const deck = buildDeck({
    design: {
      themeId: "terra",
      themeOverrides: {
        tokenSet: {
          ...resolveThemeTokens("terra"),
          id: "custom:terra",
          name: "Custom Terra",
        },
      },
    },
    slides: [
      buildSlide({
        id: "s1",
        index: 0,
        title: "Slide",
        masterId: "master-terra",
        designOverrides: { accent: { value: "#ff0000" } },
        elements: [slideElement],
      }),
    ],
    customTemplates: [
      customTemplate("custom-keep"),
      { ...customTemplate("theme:terra:cover"), source: "theme" as const },
    ],
  });

  const result = executeCommand(deck, {
    type: "APPLY_THEME_PACKAGE",
    packageId: "pulse",
  });

  assert.equal(result.ok, true);
  assert.equal((result.deck as any).design.themeId, "pulse");
  assert.equal((result.deck as any).design.themeOverrides.tokenSet.id, "pulse");
  assert.equal((result.deck as any).defaultMasterId, "master-pulse");
  assert.equal((result.deck.slides[0] as any).masterId, "master-pulse");
  assert.deepEqual(result.deck.slides[0]!.elements, [slideElement]);
  assert.deepEqual(result.deck.slides[0]!.designOverrides, {
    accent: { value: "#ff0000" },
  });
  assert.equal(
    (result.deck.customTemplates ?? []).some(
      (template) => template.id === "custom-keep",
    ),
    true,
  );
  assert.equal(
    (result.deck.customTemplates ?? []).some(
      (template) => template.id === "theme:terra:cover",
    ),
    false,
  );
  assert.equal(
    themePackageTemplatesForDeck(result.deck).length,
    THEME_PACKAGE_TEMPLATE_KINDS.length,
  );
  assert.equal(result.patches[0]!.op, "presentation.apply_theme_package");
  assert.deepEqual(applyPatch(deck, result.patches[0]!), result.deck);
  assert.equal(safeParseDeck(result.deck).success, true);
});

test("theme package catalog applies as schema-valid decks", () => {
  const deck = buildCommandDeck(["s1"]);
  assert.equal(THEME_PACKAGES.length, 8);
  assert.equal(
    THEME_PACKAGES.map((themePackage) => themePackage.id as string).includes(
      "default",
    ),
    false,
  );
  assert.equal(resolveThemePackageId("default"), DEFAULT_THEME_PACKAGE_ID);
  for (const themePackage of THEME_PACKAGES) {
    const result = executeCommand(deck, {
      type: "APPLY_THEME_PACKAGE",
      packageId: themePackage.id,
    });
    assert.equal(result.ok, true, themePackage.id);
    assert.equal(safeParseDeck(result.deck).success, true, themePackage.id);
    assert.equal(
      themePackageTemplatesForDeck(result.deck).length,
      THEME_PACKAGE_TEMPLATE_KINDS.length,
    );
  }
});

test("APPLY_THEME_PACKAGE maps default to the default package target", () => {
  const result = executeCommand(buildCommandDeck(["s1"]), {
    type: "APPLY_THEME_PACKAGE",
    packageId: "default",
  });

  assert.equal(result.ok, true);
  assert.equal((result.deck as any).design.themeId, DEFAULT_THEME_PACKAGE_ID);
  assert.equal(
    themePackageTemplatesForDeck(result.deck).length,
    THEME_PACKAGE_TEMPLATE_KINDS.length,
  );
  assert.equal(safeParseDeck(result.deck).success, true);
});

test("theme package semantic metadata covers every package template kind", () => {
  for (const themePackage of THEME_PACKAGES) {
    assert.equal(
      themePackage.templateMetadata.length,
      THEME_PACKAGE_TEMPLATE_KINDS.length,
    );
    const catalog = themePackageTemplateCatalogForAi(themePackage.id);
    assert.equal(catalog.length, THEME_PACKAGE_TEMPLATE_KINDS.length);
    const groups = themePackageTemplateGroupsForUi(themePackage.id);
    assert.ok(groups.length > 1);
    for (const kind of THEME_PACKAGE_TEMPLATE_KINDS) {
      const metadata = getThemePackageTemplateMetadata(themePackage.id, kind);
      assert.ok(metadata, `${themePackage.id}:${kind}`);
      const template = themePackage.templates.find(
        (entry) => entry.id === `theme:${themePackage.id}:${kind}`,
      );
      assert.ok(template, `${themePackage.id}:${kind}`);
      assert.equal(template.source, "theme");
      assert.equal(template.semanticKind, kind);
      assert.equal(template.layoutFamily, metadata.renderFamily);
      assert.equal(template.styleMode, "theme-aware");
      assert.deepEqual(template.accepts, metadata.accepts);
      assert.deepEqual(template.capacity, metadata.capacity);
      assert.equal(metadata.kind, kind);
      assert.ok(metadata.label.length > 0);
      assert.ok(metadata.bestFor.length > 0);
      assert.ok(metadata.accepts.length > 0);
      assert.ok(metadata.bindings.length >= 0);
      assert.equal(
        resolveThemePackageTemplateId(themePackage.id, kind),
        `theme:${themePackage.id}:${kind}`,
      );
    }
  }
  assert.equal(isThemePackageTemplateId("theme:clarity:two-column"), false);
  assert.equal(
    getThemePackageTemplateMetadata("clarity", "two-column"),
    undefined,
  );
});

test("UPDATE_THEME_OVERRIDES reset restores package token set", () => {
  const applied = executeCommand(buildCommandDeck(["s1"]), {
    type: "APPLY_THEME_PACKAGE",
    packageId: "pulse",
  });
  assert.equal(applied.ok, true);
  const edited = executeCommand(applied.deck, {
    type: "UPDATE_THEME_OVERRIDES",
    patch: { colors: { accent: "#123456" } },
  });
  assert.equal(edited.ok, true);
  assert.equal(
    (edited.deck as any).design.themeOverrides.tokenSet.colors.accent,
    "#123456",
  );

  const reset = executeCommand(edited.deck, {
    type: "UPDATE_THEME_OVERRIDES",
    patch: {},
    reset: true,
  });

  assert.equal(reset.ok, true);
  assert.deepEqual(
    (reset.deck as any).design.themeOverrides.tokenSet,
    getThemePackage("pulse")!.tokenSet,
  );
  assert.equal(safeParseDeck(reset.deck).success, true);
});

test("ADD_SLIDE_FROM_TEMPLATE materializes theme package templates", () => {
  const applied = executeCommand(buildCommandDeck(["s1"]), {
    type: "APPLY_THEME_PACKAGE",
    packageId: "pulse",
  });
  assert.equal(applied.ok, true);
  const template = themePackageTemplatesForDeck(applied.deck)[0]!;
  assert.equal(isThemePackageTemplateId(template.id), true);

  const result = executeCommand(applied.deck, {
    type: "ADD_SLIDE_FROM_TEMPLATE",
    templateId: template.id,
  });

  assert.equal(result.ok, true);
  const added = result.deck.slides.at(-1) as any;
  assert.equal(added.templateId, template.id);
  assert.equal(added.masterId, "master-pulse");
  assert.equal(
    added.elements.some(
      (element: any) => element.opacity !== undefined || element.locked,
    ),
    true,
  );
  assert.equal(safeParseDeck(result.deck).success, true);
});

test("theme package templates cannot be mutated through custom template commands", () => {
  const applied = executeCommand(buildCommandDeck(["s1"]), {
    type: "APPLY_THEME_PACKAGE",
    packageId: "pulse",
  });
  assert.equal(applied.ok, true);
  const templateId = themePackageTemplatesForDeck(applied.deck)[0]!.id;

  const create = executeCommand(applied.deck, {
    type: "CREATE_CUSTOM_TEMPLATE",
    template: customTemplate(templateId),
  });
  assert.equal(create.ok, false);

  const update = executeCommand(applied.deck, {
    type: "UPDATE_CUSTOM_TEMPLATE",
    templateId,
    patch: { name: "Mutated" },
  });
  assert.equal(update.ok, false);

  const remove = executeCommand(applied.deck, {
    type: "DELETE_CUSTOM_TEMPLATE",
    templateId,
  });
  assert.equal(remove.ok, false);
});

test("ADD_SLIDE_FROM_TEMPLATE materializes a built-in template slide", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "ADD_SLIDE_FROM_TEMPLATE",
    templateId: "title",
    afterSlideId: "s1",
  });
  assert.equal(result.ok, true);
  assert.equal(result.deck.slides.length, 2);
  assert.equal((result.deck.slides[1] as any).templateId, "title");
  assert.ok((result.deck.slides[1] as any).elements.length > 0);
  assert.equal(result.patches[0]!.op, "slide.add_from_template");
  assert.equal(safeParseDeck(result.deck).success, true);
});

test("APPLY_SLIDE_TEMPLATE explicitly replaces slide elements", () => {
  const deck = buildCommandDeck(["s1"]);
  const result = executeCommand(deck, {
    type: "APPLY_SLIDE_TEMPLATE",
    slideId: "s1",
    templateId: "visual",
    visualId: "vis-1",
  });
  assert.equal(result.ok, true);
  assert.equal((result.deck.slides[0] as any).templateId, "visual");
  assert.ok(
    (result.deck.slides[0] as any).elements.some(
      (element: any) => element.kind === "visual",
    ),
  );
  assert.equal(result.patches[0]!.op, "slide.apply_template");
  assert.equal(safeParseDeck(result.deck).success, true);
});

test("APPLY_SLIDE_TEMPLATE can preserve matching element content", () => {
  const titleElement = {
    id: "existing-title",
    kind: "text",
    role: "title",
    box: { x: 6, y: 6, w: 88, h: 14 },
    zIndex: 0,
    content: {
      kind: "text",
      text: "Keep me",
      paragraphs: [{ text: "Keep me" }],
    },
  } as unknown as SlideElement;
  const deck = buildDeck({
    design: { themeId: "default" },
    slides: [
      buildSlide({
        id: "s1",
        index: 0,
        title: "Slide",
        elements: [titleElement],
      }),
    ],
  });
  const result = executeCommand(deck, {
    type: "APPLY_SLIDE_TEMPLATE",
    slideId: "s1",
    templateId: "title",
    mode: "preserve",
  });
  assert.equal(result.ok, true);
  const title = (result.deck.slides[0].elements ?? []).find(
    (element: any) => element.kind === "text" && element.role === "title",
  );
  assert.equal((title as any)?.content.text, "Keep me");
  assert.equal(safeParseDeck(result.deck).success, true);
});

test("custom template CRUD updates deck.customTemplates and replays patches", () => {
  const deck = buildCommandDeck(["s1"]);
  const create = executeCommand(deck, {
    type: "CREATE_CUSTOM_TEMPLATE",
    template: customTemplate(),
  });
  assert.equal(create.ok, true);
  assert.equal((create.deck as any).customTemplates[0].source, "custom");
  assert.equal((create.deck as any).customTemplates[0].styleMode, "fixed");
  assert.equal(create.patches[0]!.op, "template.create_custom");
  assert.deepEqual(applyPatch(deck, create.patches[0]!), create.deck);

  const update = executeCommand(create.deck, {
    type: "UPDATE_CUSTOM_TEMPLATE",
    templateId: "template-custom",
    patch: { name: "Renamed", source: "theme" },
  });
  assert.equal(update.ok, true);
  assert.equal((update.deck as any).customTemplates[0].name, "Renamed");
  assert.equal((update.deck as any).customTemplates[0].source, "custom");
  assert.equal(update.patches[0]!.op, "template.update_custom");

  const remove = executeCommand(update.deck, {
    type: "DELETE_CUSTOM_TEMPLATE",
    templateId: "template-custom",
  });
  assert.equal(remove.ok, true);
  assert.equal((remove.deck as any).customTemplates.length, 0);
  assert.equal(remove.patches[0]!.op, "template.delete_custom");
  assert.equal(remove.patches[0]!.removedIds?.[0], "template-custom");
});

test("ADD_SLIDE_FROM_TEMPLATE materializes a custom template", () => {
  const deck = {
    ...buildCommandDeck(["s1"]),
    customTemplates: [customTemplate()],
  } as Deck;
  const result = executeCommand(deck, {
    type: "ADD_SLIDE_FROM_TEMPLATE",
    templateId: "template-custom",
  });
  assert.equal(result.ok, true);
  const added = result.deck.slides.at(-1) as any;
  assert.match(added.id, /^sl-/);
  assert.equal(added.templateId, "template-custom");
  assert.equal(added.elements[0].content.text, "Custom title");
  assert.equal(safeParseDeck(result.deck).success, true);
});

test("ADD_SLIDE_FROM_TEMPLATE omits custom template master chrome elements", () => {
  const template = customTemplate();
  template.elements = [
    ...template.elements,
    {
      id: "slot-footer",
      kind: "text",
      role: "footer",
      masterChromeKind: "footer",
      box: { x: 6, y: 92, w: 88, h: 4 },
      contentDefaults: {
        kind: "text",
        text: "Footer",
        paragraphs: [{ text: "Footer" }],
      },
    } as any,
  ];
  const deck = {
    ...buildCommandDeck(["s1"]),
    customTemplates: [template],
  } as Deck;

  const result = executeCommand(deck, {
    type: "ADD_SLIDE_FROM_TEMPLATE",
    templateId: "template-custom",
  });

  assert.equal(result.ok, true);
  const added = result.deck.slides.at(-1) as any;
  assert.deepEqual(
    added.elements.map((element: any) => element.role),
    ["title"],
  );
});
