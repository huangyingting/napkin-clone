import type { Prisma } from "@/generated/prisma/client";

/**
 * Single source of truth for provider resolution.
 *
 * Rules (mirror what prisma.config.ts does at the Prisma-tooling layer):
 *  - DB_PROVIDER === "postgres"  →  "postgres"
 *  - anything else               →  "sqlite"  (zero-setup local default)
 *
 * `prisma.config.ts` is loaded by Prisma CLI outside the app's TS path
 * aliases, so it cannot import this module; its copy of the logic is kept
 * intentionally in sync — see the comment there.
 */
export function resolveProvider(): "postgres" | "sqlite" {
  return process.env.DB_PROVIDER === "postgres" ? "postgres" : "sqlite";
}

/**
 * Returns the effective DATABASE_URL for the resolved provider.
 *
 * - If DATABASE_URL is set it always wins.
 * - For SQLite, falls back to `"file:./prisma/dev.db"` so a fresh clone works
 *   with no configuration.
 * - For Postgres, returns `undefined` when DATABASE_URL is unset (callers that
 *   need it must throw their own descriptive error).
 */
export function resolveUrl(): string | undefined {
  const explicit = process.env.DATABASE_URL;
  if (explicit !== undefined) return explicit;
  return resolveProvider() === "sqlite" ? "file:./prisma/dev.db" : undefined;
}

/**
 * Builds a Prisma `StringFilter` that is case-insensitive across providers.
 *
 * Provider behaviour:
 * - **Postgres** – adds `mode: 'insensitive'` which maps to `ILIKE`.
 * - **SQLite**   – omits `mode`; SQLite's `LIKE` is already case-insensitive
 *   for ASCII characters by default.
 *
 * The `as unknown as Prisma.StringFilter` cast lives here — in one documented
 * place — because the Prisma client is generated from the SQLite schema by
 * default, and the SQLite `StringFilter` type does not include the `mode`
 * field. The cast is safe: Prisma passes the field through to the DB driver
 * unchanged, and the Postgres adapter honours `mode: 'insensitive'`.
 *
 * @param value – pre-normalised search string to match with `contains`.
 */
export function caseInsensitiveContains(value: string): Prisma.StringFilter {
  if (resolveProvider() === "postgres") {
    return {
      contains: value,
      mode: "insensitive",
    } as unknown as Prisma.StringFilter;
  }
  return { contains: value };
}
