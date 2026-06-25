/**
 * Canonical boundary for raw `Document.deckJson` values read from persistence.
 *
 * Prisma JSON columns are expected to surface as parsed JSON values. A serialized
 * JSON string is persisted-schema drift, not supported runtime input.
 */

export function normalizePersistedDeckJson(raw: unknown): unknown {
  if (typeof raw === "string") {
    return null;
  }
  return raw;
}
