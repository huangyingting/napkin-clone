import assert from "node:assert/strict";
import test from "node:test";

import {
  parseRouteMatrixKeys,
  parseRuntimeConfigNames,
  scanEnvReadsInText,
} from "./check-docs-source-inventory.mjs";

test("docs source inventory: extracts env reads from direct and constant-key access", () => {
  const reads = scanEnvReadsInText(
    "src/example.ts",
    `
      export const FEATURE_FLAG_ENV = "FEATURE_FLAG";
      const value = process.env.AUTH_SECRET;
      const other = process.env["DATABASE_URL"];
      const enabled = env[FEATURE_FLAG_ENV];
      const port = env.PORT;
      // process.env.COMMENT_ONLY must not count.
    `,
  );

  assert.deepEqual([...reads.keys()].sort(), [
    "AUTH_SECRET",
    "DATABASE_URL",
    "FEATURE_FLAG",
    "PORT",
  ]);
});

test("docs source inventory: parses runtime-config table names", () => {
  const names = parseRuntimeConfigNames(`
| Name | Context |
| --- | --- |
| \`AUTH_SECRET\` | App server |
| not a row | no |
| \`DATABASE_URL\` | Prisma |
`);

  assert.deepEqual(names, ["AUTH_SECRET", "DATABASE_URL"]);
});

test("docs source inventory: parses only route matrix rows from the Matrix section", () => {
  const routes = parseRouteMatrixKeys(`
## Classifications
| \`authenticated-session\` | meaning |

## Matrix
| Route | Classification |
| --- | --- |
| \`brand\` | \`authenticated-session\` |
| \`auth/[...nextauth]\` | \`framework-auth\` |

## Related
| \`not-a-route\` | ignored |
`);

  assert.deepEqual(routes, ["auth/[...nextauth]", "brand"]);
});
