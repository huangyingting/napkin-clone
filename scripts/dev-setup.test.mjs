import assert from "node:assert/strict";
import test from "node:test";

import { buildLocalEnv, setupCommands } from "./dev-setup.mjs";

test("dev setup builds a local SQLite env without printing secrets", () => {
  const content = buildLocalEnv({
    authSecret: "known-secret",
    databaseUrl: "file:./prisma/dev.db",
    port: 4111,
  });
  assert.match(content, /DB_PROVIDER="sqlite"/);
  assert.match(content, /DATABASE_URL="file:\.\/prisma\/dev\.db"/);
  assert.match(content, /AUTH_SECRET="known-secret"/);
  assert.match(content, /AUTH_URL="http:\/\/localhost:4111"/);
});

test("dev setup exposes a no-db mode for worktrees with shared clients", () => {
  assert.deepEqual(setupCommands({ skipDb: true }), []);
  assert.deepEqual(
    setupCommands().map(([command, args]) => [command, args.join(" ")]),
    [
      ["npm", "run db:generate"],
      ["npm", "run db:push"],
    ],
  );
});
