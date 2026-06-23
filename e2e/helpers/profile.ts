import { createHash } from "node:crypto";

import type { Credentials } from "./auth";

/**
 * Deterministic E2E profile fixture (Epic #517, issue #518).
 *
 * The "E2E profile" is a fully deterministic seed (see `prisma/seed-e2e.ts`,
 * run via `npm run db:seed:e2e`) that creates a fixed owner user, a fixed
 * viewer user, and a single document carrying text, an embedded visual, a
 * persisted `deckJson`, an enabled public share policy, and one slide image
 * `Asset` (with storage bytes written). Every identifier below is a hard-coded
 * constant so the seed and the specs share one source of truth and never drift.
 *
 * Specs that exercise authenticated/seeded flows gate on {@link
 * e2eProfileEnabled}: when the profile is NOT enabled they skip cleanly, so the
 * credential-less fast gate and CI stay green. When `E2E_PROFILE=1` is set
 * (the `npm run test:e2e:profile` script does this against the seeded database)
 * those specs run for real and do NOT skip.
 *
 * Base values may be overridden from the environment (e.g. to point at a
 * staging seed), but the defaults are the deterministic local fixture.
 */

/** A tiny, fully-deterministic 1×1 transparent PNG used as the seeded asset. */
export const FIXTURE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** Raw bytes of {@link FIXTURE_PNG_BASE64}. */
export function fixturePngBuffer(): Buffer {
  return Buffer.from(FIXTURE_PNG_BASE64, "base64");
}

/** SHA-256 hex digest of the fixture PNG bytes — drives the asset storage key. */
export function fixtureAssetChecksum(): string {
  return createHash("sha256").update(fixturePngBuffer()).digest("hex");
}

/**
 * The deterministic fixture. IDs are hyphen-free where they must round-trip
 * through `shareIdFromParam` (the shareId), and otherwise stable strings.
 */
export const E2E_PROFILE_FIXTURE = {
  owner: {
    email: process.env.E2E_USER_EMAIL ?? "e2e-owner@textiq.test",
    password: process.env.E2E_USER_PASSWORD ?? "e2e-owner-pw-2026",
    name: "E2E Owner",
  },
  viewer: {
    email: process.env.E2E_VIEWER_EMAIL ?? "e2e-viewer@textiq.test",
    password: process.env.E2E_VIEWER_PASSWORD ?? "e2e-viewer-pw-2026",
    name: "E2E Viewer",
  },
  workspaceId: "e2efixtureworkspace0000001",
  documentId: "e2efixturedocument0000001",
  /**
   * A second, PRIVATE (never-shared) document owned by the same owner. Used to
   * assert that an anonymous/unrelated request to a private slide asset is
   * denied (403/404), in contrast to the shared `documentId` above whose asset
   * is reachable through its public present/embed policy.
   */
  privateDocumentId: "e2efixtureprivatedoc00001",
  visualId: "e2efixturevisual000000001",
  /** Share id MUST be hyphen-free so `shareIdFromParam` recovers it. */
  shareId: "e2efixtureshare01",
  slug: "e2e-fixture-deck",
  /** Text that the seeded deck's first slide renders (asserted in specs). */
  slideTitleText: "Release Gate Fixture Slide",
  slideBodyText: "Deterministic deck for the E2E release gate.",
  /** Intro paragraph text embedded in the document's contentJson. */
  documentBodyText: "E2E fixture document body for the release gate profile.",
  documentTitle: "E2E Fixture Deck",
} as const;

/** Owner login credentials for the deterministic profile. */
export function profileOwnerCredentials(): Credentials {
  return {
    email: E2E_PROFILE_FIXTURE.owner.email,
    password: E2E_PROFILE_FIXTURE.owner.password,
  };
}

/** Viewer (read-only) login credentials for the deterministic profile. */
export function profileViewerCredentials(): Credentials {
  return {
    email: E2E_PROFILE_FIXTURE.viewer.email,
    password: E2E_PROFILE_FIXTURE.viewer.password,
  };
}

/** App editor URL for the seeded document. */
export function profileDocPath(): string {
  return `/app/documents/${E2E_PROFILE_FIXTURE.documentId}`;
}

/** Public `<slug>-<shareId>` URL segment for the seeded share links. */
export function profileShareSegment(): string {
  return `${E2E_PROFILE_FIXTURE.slug}-${E2E_PROFILE_FIXTURE.shareId}`;
}

/** Public present-mode path for the seeded deck. */
export function profilePresentPath(): string {
  return `/present/${profileShareSegment()}`;
}

/** Public embed path for the seeded deck. */
export function profileEmbedPath(): string {
  return `/embed/${profileShareSegment()}`;
}

/** Protected slide-asset URL for the seeded image asset (public/shared doc). */
export function profileAssetPath(): string {
  return `/api/slide-assets/${E2E_PROFILE_FIXTURE.documentId}/${fixtureAssetChecksum()}.png`;
}

/** Protected slide-asset URL for the seeded asset on the PRIVATE document. */
export function profilePrivateAssetPath(): string {
  return `/api/slide-assets/${E2E_PROFILE_FIXTURE.privateDocumentId}/${fixtureAssetChecksum()}.png`;
}

/**
 * Single guard for every profile-dependent spec. Returns true only when the
 * deterministic E2E profile has been seeded and selected via `E2E_PROFILE=1`.
 *
 * Specs MUST `test.skip(!e2eProfileEnabled(), …)` so they degrade cleanly when
 * the profile is absent (the default for the fast gate and credential-less CI).
 */
export function e2eProfileEnabled(): boolean {
  return process.env.E2E_PROFILE === "1";
}
