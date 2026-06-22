/**
 * Deck schema versioning constants and the migration pipeline.
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
 *  - Version 1 (current): `schemaVersion: 1` stamped on every deck that passes
 *    through `migrateDeck`.
 */

/**
 * The schema version that newly-created and freshly-migrated decks carry.
 * Increment this when a structural breaking change to the {@link Deck} schema
 * requires a migration step to be added below.
 */
export const CURRENT_DECK_SCHEMA_VERSION = 1;

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
 * Normalises a raw (unvalidated) deck payload to the current schema version.
 *
 * Behaviour by version:
 * - `schemaVersion` absent or `0` (legacy): stamps `CURRENT_DECK_SCHEMA_VERSION`.
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

    // Legacy deck: no schemaVersion field or explicit null → treat as v0.
    if (version === undefined || version === null) {
      return { ...raw, schemaVersion: CURRENT_DECK_SCHEMA_VERSION };
    }

    // Explicit v0: migrate to current version.
    if (version === 0) {
      return { ...raw, schemaVersion: CURRENT_DECK_SCHEMA_VERSION };
    }

    // Any other value: pass through and let validateDeck handle it.
    // This covers both the current version (pass-through) and future/unknown
    // versions (validateDeck will reject them with a clear error).
    return raw;
  } catch {
    // Safety net — must not throw under any circumstances.
    return raw;
  }
}
