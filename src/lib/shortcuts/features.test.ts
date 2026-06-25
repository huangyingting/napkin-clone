import assert from "node:assert/strict";
import test from "node:test";

import { isAppShellShortcutHelpEnabled } from "@/lib/shortcuts/features";

test("shortcut subsystem owns app-shell shortcut help visibility", () => {
  assert.equal(isAppShellShortcutHelpEnabled(), true);
});
