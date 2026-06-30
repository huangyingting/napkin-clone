import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDeck } from "@/test/builders/deck";
import { safeParseDeck } from "./deck-schema";
import { materializePackageTemplateDeck } from "./package-template-materializer";

const baseDeck = buildDeck({ design: { themeId: "clarity" }, slides: [] });

test("materializePackageTemplateDeck creates schema-valid semantic package slides", () => {
  const deck = materializePackageTemplateDeck({
    baseDeck,
    packageId: "clarity",
    plan: {
      schemaVersion: 1,
      language: "en",
      slides: [
        {
          title: "Evidence",
          templateKind: "evidence",
          slots: {
            title: "Evidence",
            table: {
              caption: "Proof",
              columns: ["Source", "Claim"],
              rows: [
                ["A", "One"],
                ["B", "Two"],
              ],
            },
          },
        },
        {
          title: "Detail",
          templateKind: "detail",
          slots: {
            title: "Detail",
            body: "This is a dense explanatory paragraph with background, constraints, and rationale that should populate a body text region instead of being forced into bullets.",
          },
        },
        {
          title: "Next",
          templateKind: "recommendation",
          slots: { title: "Next", bullets: ["Ship", "Measure"] },
        },
      ],
    },
  });

  assert.ok(deck);
  assert.equal(safeParseDeck(deck).success, true);
  assert.equal(deck.slides.length, 3);
  assert.equal(deck.slides[0].templateId, "theme:clarity:evidence");
  assert.equal(deck.slides[0].masterId, "master-clarity");
  assert.ok(
    deck.slides[0].elements?.some((element) => element.kind === "table"),
  );
  assert.equal(deck.slides[1].templateId, "theme:clarity:detail");
  assert.ok(
    deck.slides[1].elements?.some(
      (element) => element.kind === "text" && element.role === "body",
    ),
  );
  assert.equal(deck.slides[2].templateId, "theme:clarity:recommendation");
});

test("materializePackageTemplateDeck falls back when a plan references an unknown template", () => {
  const deck = materializePackageTemplateDeck({
    baseDeck,
    packageId: "clarity",
    plan: {
      schemaVersion: 1,
      language: "en",
      slides: [
        {
          title: "Fallback",
          templateKind: "experimental-template" as any,
          notes: "Speaker note",
          slots: {
            title: "Fallback",
            body: "First paragraph\n\nSecond paragraph",
            bullets: ["Retain", "Assert"],
            table: {
              columns: ["Metric", "Status"],
              rows: [["Coverage"]],
            },
            visualId: "visual-1",
          },
        },
      ],
    },
  });

  assert.ok(deck);
  const slide = deck.slides[0];
  assert.equal(slide.title, "Fallback");
  assert.equal(slide.notes, "Speaker note");
  assert.equal(slide.templateId, "theme:clarity:experimental-template");
  assert.equal(slide.masterId, "master-clarity");
  assert.deepEqual(
    slide.elements?.map((element) => element.zIndex),
    [0, 1, 2, 3, 4],
  );
  assert.ok(
    slide.elements?.some(
      (element) => element.kind === "text" && element.role === "title",
    ),
  );
  assert.ok(
    slide.elements?.some(
      (element) =>
        element.kind === "text" &&
        element.role === "body" &&
        element.content.paragraphs?.length === 2,
    ),
  );
  assert.ok(
    slide.elements?.some(
      (element) =>
        element.kind === "text" &&
        element.role === "bullet" &&
        element.content.paragraphs?.every(
          (paragraph) => paragraph.listType === "bullet",
        ),
    ),
  );
  assert.ok(
    slide.elements?.some(
      (element) =>
        element.kind === "table" &&
        element.content.rows[0]?.cells[1]?.text === "",
    ),
  );
  assert.ok(
    slide.elements?.some(
      (element) =>
        element.kind === "visual" && element.content.visualId === "visual-1",
    ),
  );
});

test("materializePackageTemplateDeck fills custom template placeholders by role", () => {
  const deck = materializePackageTemplateDeck({
    baseDeck: {
      ...baseDeck,
      customTemplates: [
        {
          id: "theme:clarity:custom-roles",
          name: "Custom role coverage",
          source: "user",
          elements: [
            {
              id: "subtitle",
              kind: "text",
              role: "subtitle",
              box: { x: 8, y: 18, w: 84, h: 10 },
            },
            {
              id: "quote",
              kind: "text",
              role: "quote",
              box: { x: 8, y: 30, w: 60, h: 14 },
            },
            {
              id: "caption",
              kind: "text",
              role: "caption",
              box: { x: 8, y: 48, w: 60, h: 8 },
            },
            {
              id: "visual",
              kind: "visual",
              role: "visual",
              box: { x: 62, y: 24, w: 30, h: 24 },
            },
          ],
        } as any,
      ],
    },
    packageId: "clarity",
    plan: {
      schemaVersion: 1,
      language: "en",
      slides: [
        {
          title: "Custom",
          templateKind: "custom-roles" as any,
          slots: {
            title: "Custom",
            subtitle: "Signal",
            quote: "Quality is a promise",
            caption: "Source: QA",
            visualId: "visual-role",
          },
        },
      ],
    },
  });

  assert.ok(deck);
  const slide = deck.slides[0];
  assert.deepEqual(
    slide.elements?.map((element) =>
      element.kind === "text"
        ? [element.role, element.content.text]
        : [element.role, (element.content as { visualId?: string }).visualId],
    ),
    [
      ["subtitle", "Signal"],
      ["quote", "Quality is a promise"],
      ["caption", "Source: QA"],
      ["visual", "visual-role"],
    ],
  );
});

test("materializePackageTemplateDeck returns null for unknown theme packages", () => {
  assert.equal(
    materializePackageTemplateDeck({
      baseDeck,
      packageId: "missing-package" as any,
      plan: { schemaVersion: 1, language: "en", slides: [] },
    }),
    null,
  );
});
