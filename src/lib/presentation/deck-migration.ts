/**
 * Deck schema versioning constants and the migration pipeline (issue #486).
 *
 * Design goals:
 *  - Pure and headless — no DOM, no React, no browser APIs. Fully testable
 *    under `node --test`.
 *  - `migrateDeck` never throws; it is safe to call from any parse path.
 *  - Additive only — no existing fields are renamed or removed.
 *
 * Version history:
 *  - Version 0 (legacy): no `schemaVersion` field.  All decks authored before
 *    this pipeline was introduced fall into this bucket.  Fully supported.
 *  - Version 1: `schemaVersion: 1` stamped; no structural change (version
 *    stamp only introduced in the original pipeline).
 *  - Version 2 (current): slides without `elements[]` have their legacy
 *    `title`/`bullets`/`visualIds` materialized into `elements[]` by
 *    `materializeSlideElements`, marking them `elementsDerived: true`.
 *    This makes `elements[]` the authoritative render track for all slides and
 *    reduces fallback paths. Migration is idempotent: slides that already have
 *    `elements[]` are left untouched. Legacy fields are preserved on disk as a
 *    fallback for any consumer that is unaware of `elements[]`.
 *
 * ## Plan (issue #486)
 *
 * ### Problem
 * Every legacy deck stores slides in the "flat-content" (legacy) track:
 * `title`, `bullets`, `visualIds`, `layout`.  The free-form editor also
 * produces `elements[]` — an authoritative positioned-element list.  The two
 * tracks co-exist in the schema but renderers apply different code paths,
 * complicating maintenance and testing.
 *
 * ### Goal
 * Make `elements[]` authoritative for ALL slides, eliminating the legacy
 * renderer path as a concern for new code, while keeping the existing visual
 * output byte-for-byte identical.
 *
 * ### Approach
 * 1. Bump `CURRENT_DECK_SCHEMA_VERSION` from 1 → 2.
 * 2. Add a v1→v2 migration step in `migrateDeck` that, for each slide that
 *    lacks `elements[]`, calls `materializeSlideElements` to derive the
 *    positioned element list from legacy fields and stamps `elementsDerived: true`.
 * 3. Keep legacy fields unchanged on disk — renderers that read `elements[]`
 *    when present already produce identical output, so rendering is unaffected.
 * 4. The migration is idempotent by construction: slides with non-empty
 *    `elements[]` are left untouched, so calling `migrateDeck` repeatedly on
 *    an already-migrated deck is a no-op beyond the schemaVersion stamp.
 *
 * ### Safety
 * - `migrateDeck` never throws.
 * - Non-slide or malformed slide rows are skipped without error.
 * - `elementsDerived: true` signals downstream ("Sync from document") that
 *   these elements are machine-derived and may be re-materialized on sync.
 *   Any genuine user edit clears the flag to `false`, preserving hand-authored
 *   elements verbatim.
 */

import { materializeSlideElements } from "./deck";

/**
 * The schema version that newly-created and freshly-migrated decks carry.
 * Increment this when a structural breaking change to the {@link Deck} schema
 * requires a migration step to be added below.
 */
export const CURRENT_DECK_SCHEMA_VERSION = 2;

/**
 * The oldest schema version this build can read and migrate.
 *
 * Version 0 is the "no version" legacy format — any deck without a
 * `schemaVersion` field is treated as version 0 and is fully supported.
 * Decks carrying a version below this constant would be too old to parse
 * safely and must be rejected.
 */
export const MIN_SUPPORTED_DECK_SCHEMA_VERSION = 0;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Materializes legacy slide fields into `elements[]` for a single raw slide
 * object (v1 → v2 step). The slide is returned unchanged when it already has a
 * non-empty `elements[]`. This helper is intentionally untyped on input
 * (`Record<string, unknown>`) because it runs before schema validation.
 */
function migrateSlideV1ToV2(
  rawSlide: Record<string, unknown>,
): Record<string, unknown> {
  const elements = rawSlide.elements;
  if (Array.isArray(elements) && elements.length > 0) {
    // Already on free-form track — idempotent: leave unchanged.
    return rawSlide;
  }

  // Build a minimal Slide-shaped object so materializeSlideElements can work.
  // We only need the fields it reads; extras are forwarded as-is.
  const slideInput = {
    id: typeof rawSlide.id === "string" ? rawSlide.id : "migrated",
    index: typeof rawSlide.index === "number" ? rawSlide.index : 0,
    title: typeof rawSlide.title === "string" ? rawSlide.title : "",
    titleRuns: Array.isArray(rawSlide.titleRuns)
      ? rawSlide.titleRuns
      : undefined,
    bullets: Array.isArray(rawSlide.bullets)
      ? (rawSlide.bullets as string[])
      : [],
    bulletRuns: Array.isArray(rawSlide.bulletRuns)
      ? rawSlide.bulletRuns
      : undefined,
    visualIds: Array.isArray(rawSlide.visualIds)
      ? (rawSlide.visualIds as string[])
      : [],
    layout: typeof rawSlide.layout === "string" ? rawSlide.layout : "content",
    notes: typeof rawSlide.notes === "string" ? rawSlide.notes : "",
    theme: typeof rawSlide.theme === "string" ? rawSlide.theme : "default",
  } as Parameters<typeof materializeSlideElements>[0];

  const derived = materializeSlideElements(slideInput);

  return {
    ...rawSlide,
    elements: derived,
    elementsDerived: true,
  };
}

/**
 * Normalises a raw (unvalidated) deck payload to the current schema version.
 *
 * Behaviour by version:
 * - `schemaVersion` absent, `null`, or `0`–`1` (legacy/v1): migrates to
 *   `CURRENT_DECK_SCHEMA_VERSION` (currently 2), materializing any slides
 *   that lack `elements[]` into the free-form track.
 * - `schemaVersion === CURRENT_DECK_SCHEMA_VERSION`: returned unchanged.
 * - `schemaVersion > CURRENT_DECK_SCHEMA_VERSION`: returned unchanged so that
 *   the subsequent `validateDeck` call can surface a clear unsupported-version
 *   error rather than silently mangling an unknown schema.
 * - Non-object payloads: returned unchanged (the schema validator rejects them).
 *
 * This function **never throws**.
 */
export function migrateDeck(raw: unknown): unknown {
  try {
    if (!isPlainObject(raw)) {
      return raw;
    }

    const version = raw.schemaVersion;

    // Current version: pass through unchanged (same reference, no copy).
    if (version === CURRENT_DECK_SCHEMA_VERSION) {
      return raw;
    }

    // Only migrate from known legacy/v1 versions. All other values (future
    // versions, invalid types, negative numbers, non-integer numbers) are
    // returned unchanged so the subsequent `validateDeck` call can surface a
    // clear error rather than silently mangling an unknown schema.
    const shouldMigrate =
      version === undefined ||
      version === null ||
      version === 0 ||
      version === 1;

    if (!shouldMigrate) {
      return raw;
    }

    // Legacy (no version, null, 0) and v1: migrate to v2.
    // Materialize slides that lack elements[], then stamp the schema version.
    const rawSlides = raw.slides;
    const migratedSlides = Array.isArray(rawSlides)
      ? rawSlides.map((slide) =>
          isPlainObject(slide) ? migrateSlideV1ToV2(slide) : slide,
        )
      : rawSlides;

    return {
      ...raw,
      slides: migratedSlides,
      schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    };
  } catch {
    // Safety net — must not throw under any circumstances.
    return raw;
  }
}
