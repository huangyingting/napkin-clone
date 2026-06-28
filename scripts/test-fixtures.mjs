import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export function testFixturePath(name) {
  return join(process.cwd(), ".tmp", "test-fixtures", name);
}

export function createTestFixtureRoot(name, testContext) {
  const root = testFixturePath(name);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  testContext?.after?.(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
