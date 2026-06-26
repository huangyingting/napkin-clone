import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createCollabAuthorizer } from "./collab-auth.mjs";

const originalConsoleError = console.error;

afterEach(() => {
  console.error = originalConsoleError;
});

test("collab authorizer fails closed when authorization hangs", async () => {
  console.error = () => {};
  const authorize = createCollabAuthorizer({
    authorizeUrl: "http://127.0.0.1:4000/api/collab/authorize",
    timeoutMs: 1,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        const abort = () => reject(new Error("aborted"));
        // Register the listener first, then handle an already-aborted signal:
        // with a 1ms timeout the abort can fire before this fetch stub runs,
        // and a missed abort event would hang the promise (flaky in CI).
        init.signal.addEventListener("abort", abort, { once: true });
        if (init.signal.aborted) abort();
      }),
  });

  const decision = await authorize(
    { headers: { cookie: "session=abc" } },
    "doc-1",
  );

  assert.deepEqual(decision, { ok: false, status: 403 });
});
