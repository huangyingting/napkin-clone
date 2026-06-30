import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CURRENT_DECK_SCHEMA_VERSION,
  type ImageElement,
  type TextElement,
} from "./deck";
import { safeParseDeck } from "./deck-schema";
import {
  buildTemplateSlide,
  getBuiltInSlideTemplate,
  SLIDE_TEMPLATES,
  TEMPLATE_IMAGE_PLACEHOLDER_SRC,
  type SlideTemplateKind,
} from "./slide-templates";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function elementKinds(kind: SlideTemplateKind, visualId?: string): string[] {
  const slide = buildTemplateSlide(kind, { visualId });
  return (slide.elements ?? []).map((element) => element.kind);
}

function v6Deck(slide: unknown) {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "indigo" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides: [{ ...(slide as object), index: 0 }],
  };
}

function content(element: unknown): any {
  return (element as any)?.content ?? {};
}

function role(element: unknown): string | undefined {
  return (element as any)?.role;
}

function slideLayout(slide: unknown): string {
  return (slide as any).templateId ?? "blank";
}

function slideVisualIds(slide: unknown): string[] {
  return (((slide as any).elements ?? []) as unknown[])
    .filter((element: any) => element.kind === "visual")
    .map((element) => content(element).visualId)
    .filter((id): id is string => typeof id === "string");
}

// ---------------------------------------------------------------------------
// Template catalogue
// ---------------------------------------------------------------------------

test("SLIDE_TEMPLATES exposes the five expected kinds in order", () => {
  assert.deepEqual(
    SLIDE_TEMPLATES.map((option) => option.kind),
    ["title", "content", "visual", "two-column", "blank"],
  );
  for (const option of SLIDE_TEMPLATES) {
    assert.ok(option.label.length > 0);
    assert.ok(option.description.length > 0);
  }
});

test("built-in template lookup returns authored records and rejects unknown kinds", () => {
  const content = getBuiltInSlideTemplate("content");
  assert.equal(content.category, "content");
  assert.equal(content.source, "system");
  assert.equal(content.semanticKind, "content");
  assert.equal(content.layoutFamily, "title-bullets");
  assert.equal(content.styleMode, "fixed");
  assert.equal(getBuiltInSlideTemplate("blank").source, "system");
  assert.throws(
    () => getBuiltInSlideTemplate("missing" as SlideTemplateKind),
    /Missing built-in slide template/,
  );
});

// ---------------------------------------------------------------------------
// Authored (non-blank) templates
// ---------------------------------------------------------------------------

test("non-blank templates materialize editable elements", () => {
  for (const kind of ["title", "content", "visual", "two-column"] as const) {
    const slide = buildTemplateSlide(kind, {});
    assert.ok(
      (slide.elements?.length ?? 0) > 0,
      `${kind} must ship non-empty elements[]`,
    );
  }
});

test("non-blank templates assign unique sequential z-indices", () => {
  for (const kind of ["title", "content", "visual", "two-column"] as const) {
    const slide = buildTemplateSlide(kind, {});
    const zs = (slide.elements ?? []).map((element) => element.zIndex);
    assert.deepEqual(
      zs,
      [...zs].sort((a, b) => a - b),
    );
    assert.equal(new Set(zs).size, zs.length, `${kind} z-indices must differ`);
  }
});

test("non-blank templates assign unique element ids", () => {
  for (const kind of ["title", "content", "visual", "two-column"] as const) {
    const slide = buildTemplateSlide(kind, {});
    const ids = (slide.elements ?? []).map((element) => element.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test("template slides are valid deck payloads", () => {
  for (const kind of SLIDE_TEMPLATES.map((option) => option.kind)) {
    const slide = buildTemplateSlide(kind, {});
    const result = safeParseDeck(v6Deck(slide));
    assert.equal(result.success, true, kind);
  }
});

test("title template = editable title and subtitle text", () => {
  assert.deepEqual(elementKinds("title"), ["text", "text"]);
  const slide = buildTemplateSlide("title", {});
  assert.equal(slideLayout(slide), "title");
  const textElements = slide.elements as TextElement[];
  assert.deepEqual(
    textElements.map((element) => content(element).text),
    ["Title", "Subtitle"],
  );
  assert.equal(role(textElements[0]), "title");
});

test("content template = editable title/body text plus image", () => {
  assert.deepEqual(elementKinds("content"), ["text", "text", "image"]);
  const slide = buildTemplateSlide("content", {});
  assert.equal(slideLayout(slide), "content");
  const [title, body, image] = slide.elements ?? [];
  assert.equal(title?.kind, "text");
  assert.equal(content(title).text, "Title");
  assert.equal(body?.kind, "text");
  assert.equal(content(body).text, "Body");
  assert.equal(image?.kind, "image");
  assert.match(content(image).src, /^data:image\/svg\+xml,/);
});

test("template blueprints no longer emit non-editable placeholders", () => {
  for (const kind of ["title", "content", "two-column"] as const) {
    const slide = buildTemplateSlide(kind, {});
    assert.equal(
      (slide.elements ?? []).some((element) => "placeholderType" in element),
      false,
      `${kind} should use editable concrete elements`,
    );
  }
});

test("two-column template = title + two editable text columns", () => {
  assert.deepEqual(elementKinds("two-column"), ["text", "text", "text"]);
  const slide = buildTemplateSlide("two-column", {});
  const [, left, right] = slide.elements as [
    TextElement,
    TextElement,
    TextElement,
  ];
  assert.deepEqual(
    [content(left).text, content(right).text],
    ["Left column", "Right column"],
  );
  // Columns sit side by side: the right column starts past the left's edge.
  assert.ok(right.box.x >= left.box.x + left.box.w);
});

// ---------------------------------------------------------------------------
// Visual spotlight template
// ---------------------------------------------------------------------------

test("visual spotlight without a visualId uses an image placeholder", () => {
  assert.deepEqual(elementKinds("visual"), ["image", "text"]);
  const slide = buildTemplateSlide("visual", {});
  assert.equal(slideLayout(slide), "media");
  const image = slide.elements?.[0] as ImageElement;
  assert.match(content(image).src, /^data:image\/svg\+xml,/);
  assert.equal(content(image).src, TEMPLATE_IMAGE_PLACEHOLDER_SRC);
  assert.equal(content(image).alt, "Visual placeholder");
  assert.deepEqual(slideVisualIds(slide), []);
});

test("visual spotlight with a visualId references that document visual", () => {
  assert.deepEqual(elementKinds("visual", "vis-42"), ["visual", "text"]);
  const slide = buildTemplateSlide("visual", {
    visualId: "vis-42",
  });
  const visual = slide.elements?.[0];
  assert.equal(visual?.kind, "visual");
  assert.equal(content(visual).visualId, "vis-42");
  assert.equal((visual as any).box.w, 92);
  assert.deepEqual(slideVisualIds(slide), ["vis-42"]);
});

test("materialized template content defaults are deep-cloned", () => {
  const first = buildTemplateSlide("content", {});
  const second = buildTemplateSlide("content", {});
  const firstBody = first.elements?.find((element) => role(element) === "body");
  const secondBody = second.elements?.find(
    (element) => role(element) === "body",
  );

  content(firstBody).paragraphs[0].text = "Mutated";

  assert.equal(content(secondBody).paragraphs[0].text, "Body");
  assert.notEqual(
    content(firstBody).paragraphs,
    content(secondBody).paragraphs,
  );
});

// ---------------------------------------------------------------------------
// Blank template
// ---------------------------------------------------------------------------

test("blank template creates an element-first blank slide", () => {
  const slide = buildTemplateSlide("blank", {});
  assert.equal(slide.title, "");
  assert.deepEqual(slideVisualIds(slide), []);
  assert.equal(slideLayout(slide), "blank");
  assert.equal(slide.notes, "");
  assert.deepEqual(slide.elements, []);
});

test("every box stays within the 0–100 percent slide bounds", () => {
  for (const kind of ["title", "content", "visual", "two-column"] as const) {
    const slide = buildTemplateSlide(kind, {});
    for (const element of slide.elements ?? []) {
      const { x, y, w, h } = element.box;
      assert.ok(x >= 0 && y >= 0, `${kind} box origin in bounds`);
      assert.ok(x + w <= 100, `${kind} box right edge in bounds`);
      assert.ok(y + h <= 100, `${kind} box bottom edge in bounds`);
    }
  }
});

test("template free-form elements survive schema validation", () => {
  for (const kind of ["title", "content", "visual", "two-column"] as const) {
    const slide = buildTemplateSlide(kind, {});
    const result = safeParseDeck(v6Deck(slide));
    assert.ok(result.success, result.success ? "" : result.error);
    if (!result.success) return;
    assert.ok((result.data.slides[0].elements ?? []).length > 0);
  }
});

// ---------------------------------------------------------------------------
// Semantic text roles on template text (#610)
// ---------------------------------------------------------------------------

test("title template text carries title/subtitle roles", () => {
  const slide = buildTemplateSlide("title", {});
  const roles = (slide.elements ?? [])
    .filter((el) => el.kind === "text")
    .map((el) => (el.kind === "text" ? role(el) : undefined));
  assert.ok(roles.includes("title"), roles.join(","));
  assert.ok(roles.includes("subtitle"), roles.join(","));
});

test("built-in templates do not emit global master chrome elements", () => {
  for (const kind of SLIDE_TEMPLATES.map((option) => option.kind)) {
    const slide = buildTemplateSlide(kind, {});
    assert.deepEqual(
      (slide.elements ?? [])
        .map(
          (element) =>
            (element as { masterChromeKind?: unknown }).masterChromeKind,
        )
        .filter(Boolean),
      [],
      kind,
    );
  }
});

test("visual template caption text carries the caption role", () => {
  const slide = buildTemplateSlide("visual", {
    visualId: "v1",
  });
  const roles = (slide.elements ?? [])
    .filter((el) => el.kind === "text")
    .map((el) => (el.kind === "text" ? role(el) : undefined));
  assert.ok(roles.includes("caption"), roles.join(","));
});

test("every non-blank template text element carries a role", () => {
  for (const kind of ["title", "content", "visual", "two-column"] as const) {
    const slide = buildTemplateSlide(kind, {});
    for (const el of slide.elements ?? []) {
      if (el.kind === "text") {
        assert.ok(role(el) !== undefined, `${kind} text needs a role`);
      }
    }
  }
});
