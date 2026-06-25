import assert from "node:assert/strict";
import test from "node:test";

import {
  HEADER_SUPPRESSED_PATH_PREFIXES,
  shouldRenderAppHeader,
} from "./header-gate";

test("header gate keeps route-specific suppression explicit", () => {
  assert.deepEqual(HEADER_SUPPRESSED_PATH_PREFIXES, ["/embed", "/present"]);
});

test("header gate suppresses embeddable presentation routes", () => {
  assert.equal(shouldRenderAppHeader("/embed/share-1"), false);
  assert.equal(shouldRenderAppHeader("/present/share-1"), false);
  assert.equal(shouldRenderAppHeader("/present/share-1/embed"), false);
});

test("header gate renders the app header on public and app routes", () => {
  assert.equal(shouldRenderAppHeader("/"), true);
  assert.equal(shouldRenderAppHeader("/app"), true);
  assert.equal(shouldRenderAppHeader("/app/settings/billing"), true);
  assert.equal(shouldRenderAppHeader("/share/share-1"), true);
});
