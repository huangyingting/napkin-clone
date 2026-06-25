import assert from "node:assert/strict";
import { test } from "node:test";

import {
  commentAnchorFromRecord,
  commentAnchorToRecord,
  validateAnchorGeometry,
} from "@/lib/comments/anchors";
import { buildDeckSource } from "@/lib/ai/deck-source";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { createBlankVisual } from "@/lib/visual/blank";
import { FIXTURE_LIST } from "@/lib/visual/fixtures";
import {
  VISUAL_KINDS,
  safeParseVisual,
  validateVisual,
} from "@/lib/visual/schema";
import {
  buildAssetPolicyMeta as buildFixtureAssetMeta,
  fixturePngBuffer,
} from "@/test/builders/assets";
import {
  buildCommentAnchor,
  buildSlideCommentAnchor,
} from "@/test/builders/comments";
import {
  buildE2EProfileContentJson,
  buildE2EProfileDeck,
  buildE2EProfileVisual,
  e2eProfileAssetChecksum,
} from "@/test/builders/e2e-profile";
import {
  buildContentJson,
  buildHeadingNode,
  buildListNode,
  buildParagraphNode,
  buildVisualLexicalNode,
} from "@/test/builders/lexical";
import { buildDeck } from "@/test/builders/deck";
import { buildVisual, buildVisualMap } from "@/test/builders/visual";
import { SLIDE_ASSET_UPLOAD_POLICY } from "@/lib/slides/asset-policy";
import { validateAssetUploadPolicy } from "@/lib/assets/upload-policy";
import { deriveStorageKey } from "@/lib/slides/asset-storage";

test("deck builder default is current-schema valid", () => {
  const result = safeParseDeck(buildDeck());
  assert.equal(result.success, true);
  if (result.success) {
    assert.ok(result.data.schemaVersion, "schemaVersion is required");
    assert.ok(result.data.slides[0].elements?.length);
  }
});

test("visual builders and separated visual fixtures stay schema-valid", () => {
  assert.equal(safeParseVisual(buildVisual()).success, true);

  for (const visual of FIXTURE_LIST) {
    assert.equal(safeParseVisual(visual).success, true, visual.type);
  }

  for (const kind of VISUAL_KINDS) {
    assert.doesNotThrow(() => validateVisual(createBlankVisual(kind)), kind);
  }
});

test("lexical content builder feeds current deck-source parsing", () => {
  const visual = buildVisual({ title: "Embedded drift visual" });
  const contentJson = buildContentJson([
    buildHeadingNode(1, "Fixture title"),
    buildParagraphNode("Fixture paragraph."),
    buildListNode(["One", "Two"]),
    buildVisualLexicalNode("visual-fixture", visual),
  ]);

  const result = buildDeckSource(
    contentJson,
    buildVisualMap(["visual-fixture", visual]),
  );

  assert.equal(
    result.outline,
    "# Fixture title\nFixture paragraph.\n- One\n- Two\n[visual: visual-fixture]",
  );
  assert.deepEqual(
    result.visualInventory.map((item) => item.id),
    ["visual-fixture"],
  );
  assert.equal(result.truncated, false);
});

test("comment builders round-trip through comment anchor schema helpers", () => {
  const anchor = buildCommentAnchor({
    kind: "slide-element",
    slideId: "slide-fixture",
    elementId: "element-fixture",
    geometry: { x: 25, y: 75 },
  });
  const record = commentAnchorToRecord(anchor);

  assert.deepEqual(commentAnchorFromRecord(record), anchor);
  assert.deepEqual(validateAnchorGeometry(buildSlideCommentAnchor().geometry), {
    x: 25,
    y: 75,
  });
});

test("asset builders satisfy slide asset policy and storage key schema", () => {
  const bytes = fixturePngBuffer();
  const meta = buildFixtureAssetMeta();
  const policyResult = validateAssetUploadPolicy(
    SLIDE_ASSET_UPLOAD_POLICY,
    meta.mimeType,
    meta.originalName ?? "fixture.png",
    bytes.byteLength,
  );

  assert.equal(policyResult.ok, true);
  assert.equal(
    deriveStorageKey("doc-fixture", meta.checksum, meta.mimeType),
    `doc-fixture/${meta.checksum}.png`,
  );
});

test("E2E profile builders are the seed/spec single source of truth", () => {
  const visual = buildE2EProfileVisual();
  assert.equal(safeParseVisual(visual).success, true);

  const contentJson = buildE2EProfileContentJson(visual);
  assert.equal(contentJson.root.children.length, 2);

  const storageKey = deriveStorageKey(
    "e2efixturedocument0000001",
    e2eProfileAssetChecksum(),
    "image/png",
  );
  const deck = buildE2EProfileDeck(
    `/api/slide-assets/${storageKey}`,
    "asset-1",
  );
  assert.equal(safeParseDeck(deck).success, true);
});
