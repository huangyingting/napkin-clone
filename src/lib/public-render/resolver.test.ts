import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PUBLIC_RENDER_ASSET_ACCESS_SELECT,
  PUBLIC_RENDER_DOCUMENT_SELECT,
  PUBLIC_RENDER_METADATA_SELECT,
  PUBLIC_RENDER_PRESENTATION_SELECT,
} from "@/lib/public-render/resolver-selects";

test("public render selects are projection-specific", () => {
  const metadata = PUBLIC_RENDER_METADATA_SELECT as Record<string, unknown>;
  const document = PUBLIC_RENDER_DOCUMENT_SELECT as Record<string, unknown>;
  const presentation = PUBLIC_RENDER_PRESENTATION_SELECT as Record<
    string,
    unknown
  >;
  const assetAccess = PUBLIC_RENDER_ASSET_ACCESS_SELECT as Record<
    string,
    unknown
  >;

  assert.equal(metadata.content, true);
  assert.equal(metadata.contentJson, undefined);
  assert.equal(metadata.deckJson, undefined);
  assert.equal(metadata.owner, undefined);

  assert.equal(document.contentJson, true);
  assert.equal(document.content, undefined);
  assert.equal(document.deckJson, undefined);
  assert.notEqual(document.owner, undefined);

  assert.equal(presentation.contentJson, true);
  assert.equal(presentation.deckJson, true);
  assert.equal(presentation.content, undefined);

  assert.equal(assetAccess.ownerId, true);
  assert.equal(assetAccess.workspaceId, true);
  assert.equal(assetAccess.content, undefined);
  assert.equal(assetAccess.contentJson, undefined);
  assert.equal(assetAccess.deckJson, undefined);
  assert.equal(assetAccess.owner, undefined);
});
