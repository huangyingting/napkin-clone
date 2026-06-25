import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorktreeEnv,
  sanitizeWorktreeName,
  worktreeInstructions,
} from "./dev-worktree.mjs";

test("worktree helper sanitizes names for SQLite filenames", () => {
  assert.equal(sanitizeWorktreeName("N17 Dev Bootstrap"), "n17-dev-bootstrap");
  assert.equal(sanitizeWorktreeName("!!!"), "worktree");
});

test("worktree helper builds isolated env file content", () => {
  const content = buildWorktreeEnv({
    worktreeName: "Feature X",
    authSecret: "secret",
    port: 4222,
  });
  assert.match(content, /DATABASE_URL="file:\.\/prisma\/dev\.feature-x\.db"/);
  assert.match(content, /AUTH_URL="http:\/\/localhost:4222"/);
});

test("worktree helper prints source command and generated-client repair hint", () => {
  const instructions = worktreeInstructions({ envFile: ".env.worktree" });
  assert.match(instructions.join("\n"), /set -a/);
  assert.match(instructions.join("\n"), /npm run db:generate/);
});
