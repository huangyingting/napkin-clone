import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPublicMetadata } from "./metadata";

test("buildPublicMetadata returns no-index defaults when a share is denied", () => {
  assert.deepEqual(
    buildPublicMetadata({
      document: null,
      surface: "share",
      baseUrl: "https://textiq.test",
    }),
    {
      title: "Shared Document — TextIQ",
      robots: { index: false, follow: false },
    },
  );
});

test("buildPublicMetadata builds share canonical, excerpt, and OG image", () => {
  const metadata = buildPublicMetadata({
    document: {
      title: "Launch Plan",
      content: "A concise public launch plan.",
      slug: "launch-plan",
      shareId: "share123",
    },
    surface: "share",
    baseUrl: "https://textiq.test",
  });

  assert.equal(metadata.title, "Launch Plan — TextIQ");
  assert.equal(metadata.description, "A concise public launch plan.");
  assert.deepEqual(metadata.alternates, {
    canonical: "https://textiq.test/share/launch-plan-share123",
  });
  assert.deepEqual(metadata.twitter?.images, [
    "https://textiq.test/share/launch-plan-share123/opengraph-image",
  ]);
});

test("buildPublicMetadata includes present canonical and share see-also link", () => {
  const metadata = buildPublicMetadata({
    document: {
      title: "Launch Deck",
      content: "Deck summary",
      slug: "launch-deck",
      shareId: "share456",
    },
    surface: "present",
    baseUrl: "https://textiq.test",
  });

  assert.equal(metadata.title, "Launch Deck — Presentation — TextIQ");
  assert.deepEqual(metadata.alternates, {
    canonical: "https://textiq.test/present/launch-deck-share456",
  });
  assert.deepEqual(metadata.other, {
    "og:see_also": "https://textiq.test/share/launch-deck-share456",
  });
});
