import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildDocumentShareUrl,
  toEmbedShareUrl,
  toPresentShareUrl,
} from "./share-routes";

describe("share routes", () => {
  test("builds canonical share route from origin, slug, and share id", () => {
    assert.equal(
      buildDocumentShareUrl(
        "https://textiq.test",
        "Ab3xY9kQ",
        "launch-plan-24",
      ),
      "https://textiq.test/share/launch-plan-24-Ab3xY9kQ",
    );
  });

  test("returns null when share path inputs are incomplete", () => {
    assert.equal(
      buildDocumentShareUrl("https://textiq.test", null, "launch-plan"),
      null,
    );
    assert.equal(
      buildDocumentShareUrl("https://textiq.test", "Ab3xY9kQ", null),
      null,
    );
  });

  test("derives present and embed routes from the share route", () => {
    const shareUrl = "https://textiq.test/share/launch-plan-24-Ab3xY9kQ";
    assert.equal(
      toPresentShareUrl(shareUrl),
      "https://textiq.test/present/launch-plan-24-Ab3xY9kQ",
    );
    assert.equal(
      toEmbedShareUrl(shareUrl),
      "https://textiq.test/embed/launch-plan-24-Ab3xY9kQ",
    );
  });
});
