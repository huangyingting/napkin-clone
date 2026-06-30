import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SEMANTIC_TO_RENDER_FAMILY,
  THEME_PACKAGE_RENDER_FAMILIES,
  THEME_PACKAGE_TEMPLATE_KINDS,
  THEME_PACKAGE_TEMPLATE_METADATA,
  resolveThemePackageTemplateKind,
} from "./theme-template-taxonomy";

const OBSOLETE_TEMPLATE_KIND_ALIASES = [
  "context",
  "definition",
  "principle",
  "key-takeaways",
  "data-insight",
  "experiment",
  "results",
  "problem-solution",
  "before-after",
  "pros-cons",
  "tradeoff",
  "workflow",
  "customer-story",
  "market-landscape",
  "competitive-landscape",
  "decision",
  "next-steps",
  "business-model",
  "two-column",
] as const;

test("semantic template taxonomy maps every kind to a known render family", () => {
  const renderFamilies = new Set<string>(THEME_PACKAGE_RENDER_FAMILIES);
  for (const kind of THEME_PACKAGE_TEMPLATE_KINDS) {
    assert.ok(renderFamilies.has(SEMANTIC_TO_RENDER_FAMILY[kind]), kind);
  }
});

test("render family catalog contains only families used by semantic kinds", () => {
  const usedFamilies = new Set(Object.values(SEMANTIC_TO_RENDER_FAMILY));
  assert.deepEqual(new Set(THEME_PACKAGE_RENDER_FAMILIES), usedFamilies);
});

test("template metadata covers every semantic kind with AI/UI fields", () => {
  for (const kind of THEME_PACKAGE_TEMPLATE_KINDS) {
    const metadata = THEME_PACKAGE_TEMPLATE_METADATA[kind];
    assert.equal(metadata.kind, kind);
    assert.ok(metadata.label.length > 0, kind);
    assert.equal(metadata.group, metadata.intent, kind);
    assert.ok(metadata.contentMedium.length > 0, kind);
    assert.ok(metadata.bestFor.length > 0, kind);
    assert.ok(metadata.signals.length > 0, kind);
    assert.ok(metadata.signals.includes(metadata.intent), kind);
    assert.ok(metadata.signals.includes(metadata.contentMedium), kind);
    assert.ok(metadata.accepts.length > 0, kind);
    assert.ok(metadata.priority > 0, kind);
    assert.ok(metadata.bindings.length >= 0, kind);
  }
});

test("detail template supports content-heavy body text", () => {
  const metadata = THEME_PACKAGE_TEMPLATE_METADATA.detail;
  assert.equal(metadata.renderFamily, "title-body");
  assert.equal(metadata.contentMedium, "text");
  assert.ok(metadata.accepts.includes("body"));
  assert.deepEqual(metadata.capacity.body, { paragraphs: 4, chars: 900 });
});

test("obsolete semantic aliases do not resolve to template kinds", () => {
  for (const alias of OBSOLETE_TEMPLATE_KIND_ALIASES) {
    assert.equal(resolveThemePackageTemplateKind(alias), undefined, alias);
  }
});
