/**
 * Tests for the visual command adapter (issue #471).
 *
 * Verifies that `applyVisualCommand` correctly routes typed command payloads
 * through `executeVisualCommand`, returning the expected result visual and
 * command metadata (patches, side effects, affected ids).
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";

import {
  applyVisualCommand,
  buildVisualCommand,
} from "./visual-command-adapter";
import { createBlankVisual } from "@/lib/visual/fixtures";
import { STYLE_THEMES } from "@/lib/visual/themes";
import { applyTheme } from "@/lib/visual/transforms";

const VISUAL_ID = "vis-adapter-1";
const DOC_ID = "doc-1";

describe("buildVisualCommand", () => {
  test("builds a valid VisualCommand envelope", () => {
    const payload = { op: "visual.apply_theme" as const, themeId: "ocean" };
    const cmd = buildVisualCommand(payload, VISUAL_ID, DOC_ID);

    assert.strictEqual(cmd.type, "visual.apply_theme");
    assert.strictEqual(cmd.target.surface, "visual");
    assert.strictEqual(cmd.target.visualId, VISUAL_ID);
    assert.strictEqual(cmd.target.documentId, DOC_ID);
    assert.strictEqual(cmd.source, "user");
    assert.deepStrictEqual(cmd.payload, payload);
    assert.ok(typeof cmd.id === "string" && cmd.id.length > 0);
  });

  test("includes coalesceKey when provided", () => {
    const payload = { op: "visual.set_auto_layout" as const, enabled: true };
    const cmd = buildVisualCommand(payload, VISUAL_ID, undefined, "gesture-1");
    assert.strictEqual(cmd.coalesceKey, "gesture-1");
  });

  test("omits coalesceKey when not provided", () => {
    const payload = { op: "visual.apply_theme" as const, themeId: "indigo" };
    const cmd = buildVisualCommand(payload, VISUAL_ID);
    assert.ok(!("coalesceKey" in cmd) || cmd.coalesceKey === undefined);
  });
});

describe("applyVisualCommand — theme", () => {
  test("visual.apply_theme returns correct theme and metadata", () => {
    const visual = createBlankVisual("flowchart");
    const themeId = STYLE_THEMES[1]?.id ?? "ocean";

    const result = applyVisualCommand(visual, VISUAL_ID, {
      op: "visual.apply_theme",
      themeId,
    });

    assert.ok(result.ok, "result should be ok");
    // The resulting visual should differ from the input (theme was applied).
    const expected = applyTheme(visual, themeId);
    assert.deepStrictEqual(result.visual.style, expected.style);
    // Metadata: patches emitted
    assert.ok(result.patches.length === 1, "one patch emitted");
    assert.strictEqual(result.patches[0]!.op, "visual.apply_theme");
    assert.strictEqual(result.patches[0]!.visualId, VISUAL_ID);
    // Side effects include render invalidation
    assert.ok(result.sideEffects.some((e) => e.kind === "render_invalidation"));
  });
});

describe("applyVisualCommand — style", () => {
  test("visual.set_style applies color patch", () => {
    const visual = createBlankVisual("flowchart");

    const result = applyVisualCommand(visual, VISUAL_ID, {
      op: "visual.set_style",
      patch: { background: "#ff0000" },
    });

    assert.ok(result.ok);
    assert.strictEqual(result.visual.style.background, "#ff0000");
    assert.strictEqual(result.patches[0]!.op, "visual.set_style");
  });
});

describe("applyVisualCommand — display style", () => {
  test("visual.apply_display_style applies known style", () => {
    const visual = createBlankVisual("flowchart");

    const result = applyVisualCommand(visual, VISUAL_ID, {
      op: "visual.apply_display_style",
      styleId: "clean",
    });

    assert.ok(result.ok);
    assert.strictEqual(result.patches[0]!.op, "visual.apply_display_style");
  });
});

describe("applyVisualCommand — effects", () => {
  test("visual.set_effect adds shadow and emits patch", () => {
    const visual = createBlankVisual("flowchart");

    const result = applyVisualCommand(visual, VISUAL_ID, {
      op: "visual.set_effect",
      effect: { kind: "shadow" },
    });

    assert.ok(result.ok);
    assert.ok(result.visual.effects?.some((e) => e.kind === "shadow"));
    assert.strictEqual(result.patches[0]!.op, "visual.set_effect");
  });

  test("visual.clear_effect removes shadow and emits patch", () => {
    const visual = {
      ...createBlankVisual("flowchart"),
      effects: [{ kind: "shadow" as const }],
    };

    const result = applyVisualCommand(visual, VISUAL_ID, {
      op: "visual.clear_effect",
      kind: "shadow",
    });

    assert.ok(result.ok);
    assert.ok(!(result.visual.effects ?? []).some((e) => e.kind === "shadow"));
    assert.strictEqual(result.patches[0]!.op, "visual.clear_effect");
  });
});

describe("applyVisualCommand — failure path", () => {
  test("returns original visual on failure (no mutation)", () => {
    const visual = createBlankVisual("flowchart");

    // Attempting to delete a non-existent node should fail.
    const result = applyVisualCommand(visual, VISUAL_ID, {
      op: "visual.delete_node",
      nodeId: "node-does-not-exist",
    });

    assert.ok(!result.ok, "should fail for missing node");
    // Input visual unchanged.
    assert.strictEqual(result.visual, visual);
    assert.strictEqual(result.patches.length, 0);
  });
});
