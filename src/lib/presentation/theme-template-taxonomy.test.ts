import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SEMANTIC_TO_RENDER_FAMILY,
  THEME_PACKAGE_RENDER_FAMILIES,
  THEME_PACKAGE_TEMPLATE_KINDS,
  THEME_PACKAGE_TEMPLATE_METADATA,
  resolveThemePackageTemplateKind,
} from "./theme-template-taxonomy";

test("semantic template taxonomy maps every kind to a known render family", () => {
  const renderFamilies = new Set<string>(THEME_PACKAGE_RENDER_FAMILIES);
  for (const kind of THEME_PACKAGE_TEMPLATE_KINDS) {
    assert.ok(renderFamilies.has(SEMANTIC_TO_RENDER_FAMILY[kind]), kind);
  }
});

test("template metadata covers every semantic kind with AI/UI fields", () => {
  for (const kind of THEME_PACKAGE_TEMPLATE_KINDS) {
    const metadata = THEME_PACKAGE_TEMPLATE_METADATA[kind];
    assert.equal(metadata.kind, kind);
    assert.ok(metadata.label.length > 0, kind);
    assert.ok(metadata.bestFor.length > 0, kind);
    assert.ok(metadata.signals.length > 0, kind);
    assert.ok(metadata.accepts.length > 0, kind);
    assert.ok(metadata.priority > 0, kind);
    assert.ok(metadata.bindings.length >= 0, kind);
  }
});

test("legacy two-column alias resolves to comparison", () => {
  assert.equal(resolveThemePackageTemplateKind("two-column"), "comparison");
});
