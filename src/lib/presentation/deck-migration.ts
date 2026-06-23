/** Deck schema version constants. Older deck payloads are rejected, not migrated. */

import { CURRENT_DECK_SCHEMA_VERSION } from "./deck";

export { CURRENT_DECK_SCHEMA_VERSION } from "./deck";

/** The oldest schema version accepted by this build. */
export const MIN_SUPPORTED_DECK_SCHEMA_VERSION = CURRENT_DECK_SCHEMA_VERSION;
