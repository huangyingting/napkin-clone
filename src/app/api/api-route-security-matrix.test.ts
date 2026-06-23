/**
 * Guard test: the API route security matrix must classify every route
 * (Epic #495, issue #509).
 *
 * Every HTTP route under `src/app/api/**​/route.ts` must have a row in
 * `docs/security/api-route-security-matrix.md`. This test globs the filesystem,
 * parses the matrix table, and fails if:
 *   - a filesystem route has no matrix row (you added a route without
 *     classifying it), or
 *   - the matrix lists a route that no longer exists on disk (a stale row).
 *
 * The effect: "add a public surface without documenting how it's gated" fails
 * CI. Routes that intentionally carry no app-level gate live in
 * {@link NO_APP_GATE_ALLOWLIST} so that decision stays explicit and reviewable.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const API_DIR = HERE; // this test lives at src/app/api/
const REPO_ROOT = resolve(API_DIR, "..", "..", "..");
const MATRIX_DOC = join(
  REPO_ROOT,
  "docs",
  "security",
  "api-route-security-matrix.md",
);

/**
 * Routes that legitimately have no app-level gate (only the framework/auth
 * handler). They still REQUIRE a matrix row — this set just records that the
 * "public by design" decision is intentional.
 */
const NO_APP_GATE_ALLOWLIST = new Set<string>(["auth/[...nextauth]"]);

/** Recursively collect every `route.ts` file under `src/app/api`. */
function collectRouteKeys(): string[] {
  const keys: string[] = [];
  for (const entry of readdirSync(API_DIR, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || entry.name !== "route.ts") {
      continue;
    }
    // entry.parentPath is the directory holding route.ts.
    const parent: string = (entry as unknown as { parentPath: string })
      .parentPath;
    const rel = parent.slice(API_DIR.length).split(sep).filter(Boolean);
    keys.push(rel.join("/"));
  }
  return keys.sort();
}

/** Parse the route keys from the matrix table's first (backticked) column. */
function parseMatrixRouteKeys(): string[] {
  const md = readFileSync(MATRIX_DOC, "utf8");
  const keys: string[] = [];
  let inMatrixSection = false;
  for (const line of md.split("\n")) {
    const trimmed = line.trim();
    // Only parse rows inside the "## Matrix" section, so the Classifications
    // legend (which also uses backticked first cells) is never mistaken for a
    // route row.
    if (trimmed.startsWith("## ")) {
      inMatrixSection = trimmed === "## Matrix";
      continue;
    }
    if (!inMatrixSection || !trimmed.startsWith("|")) {
      continue;
    }
    const firstCell = trimmed.split("|")[1]?.trim() ?? "";
    // Only rows whose first cell is a backticked route key, e.g. `brand/font`.
    const match = firstCell.match(/^`([^`]+)`$/);
    if (match) {
      keys.push(match[1]);
    }
  }
  return keys.sort();
}

test("#509: every filesystem API route has a security-matrix row", () => {
  const fsRoutes = collectRouteKeys();
  const matrixRoutes = new Set(parseMatrixRouteKeys());

  // Sanity: we actually found routes and parsed rows.
  assert.ok(
    fsRoutes.length >= 13,
    `expected ≥13 routes, found ${fsRoutes.length}`,
  );
  assert.ok(matrixRoutes.size >= 13, "matrix parsed too few rows");

  const missing = fsRoutes.filter((r) => !matrixRoutes.has(r));
  assert.deepEqual(
    missing,
    [],
    `routes missing from docs/security/api-route-security-matrix.md: ${missing.join(", ")}`,
  );
});

test("#509: the security matrix has no stale rows for deleted routes", () => {
  const fsRoutes = new Set(collectRouteKeys());
  const matrixRoutes = parseMatrixRouteKeys();

  const stale = matrixRoutes.filter((r) => !fsRoutes.has(r));
  assert.deepEqual(
    stale,
    [],
    `matrix lists routes that no longer exist on disk: ${stale.join(", ")}`,
  );
});

test("#509: the no-app-gate allowlist only names real routes", () => {
  const fsRoutes = new Set(collectRouteKeys());
  for (const route of NO_APP_GATE_ALLOWLIST) {
    assert.ok(
      fsRoutes.has(route),
      `allowlisted route does not exist on disk: ${route}`,
    );
  }
});
