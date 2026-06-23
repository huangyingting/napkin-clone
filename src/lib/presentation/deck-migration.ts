/** Deck schema version constants. Older deck payloads are rejected, not migrated. */

/** Increment this for future structural deck schema changes. */
export const CURRENT_DECK_SCHEMA_VERSION = 2;

/** The oldest schema version accepted by this build. */
export const MIN_SUPPORTED_DECK_SCHEMA_VERSION = CURRENT_DECK_SCHEMA_VERSION;
