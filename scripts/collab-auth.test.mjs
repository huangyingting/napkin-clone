import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  createCollabAuthorizer,
  interpretAuthorizeResponse,
} from "./collab-auth.mjs";

const originalConsoleError = console.error;

afterEach(() => {
  console.error = originalConsoleError;
});

test("collab authorizer interprets route responses conservatively", () => {
  assert.deepEqual(interpretAuthorizeResponse(200, { ok: true }), {
    ok: true,
    status: 101,
    readOnly: false,
  });
  assert.deepEqual(
    interpretAuthorizeResponse(200, { ok: true, readOnly: true }),
    { ok: true, status: 101, readOnly: true },
  );
  assert.deepEqual(interpretAuthorizeResponse(401, { ok: false }), {
    ok: false,
    status: 401,
  });
  assert.deepEqual(interpretAuthorizeResponse(500, { ok: true }), {
    ok: false,
    status: 403,
  });
});

test("collab authorizer requires a concrete authorize URL and room", async () => {
  assert.throws(() => createCollabAuthorizer(), /requires authorizeUrl/);

  const authorize = createCollabAuthorizer({
    authorizeUrl: "http://127.0.0.1:4000/api/collab/authorize",
    fetchImpl: async () => {
      throw new Error("fetch should not run for default rooms");
    },
  });

  assert.deepEqual(await authorize({ headers: {} }, "default"), {
    ok: false,
    status: 403,
  });
});

test("collab authorizer forwards cookies and accepts viewer responses", async () => {
  let requestedUrl;
  let requestedHeaders;
  const authorize = createCollabAuthorizer({
    authorizeUrl: "http://127.0.0.1:4000/api/collab/authorize",
    timeoutMs: 50,
    fetchImpl: async (url, init) => {
      requestedUrl = url;
      requestedHeaders = init.headers;
      return {
        status: 200,
        json: async () => ({ ok: true, readOnly: true }),
      };
    },
  });

  const decision = await authorize(
    { headers: { cookie: "session=abc" } },
    "deck/one",
  );

  assert.deepEqual(decision, { ok: true, status: 101, readOnly: true });
  assert.equal(
    requestedUrl,
    "http://127.0.0.1:4000/api/collab/authorize?room=deck%2Fone",
  );
  assert.equal(requestedHeaders.cookie, "session=abc");
  assert.equal(requestedHeaders.accept, "application/json");
});

test("collab authorizer treats malformed JSON responses as forbidden", async () => {
  const authorize = createCollabAuthorizer({
    authorizeUrl: "http://127.0.0.1:4000/api/collab/authorize",
    fetchImpl: async () => ({
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
    }),
  });

  assert.deepEqual(await authorize({ headers: {} }, "doc-1"), {
    ok: false,
    status: 403,
  });
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

  // The production abort timer is unref()'d (see collab-auth.mjs), so under
  // `node --test` it will not, by itself, keep the event loop alive. Hold a
  // ref'd timer across the await so the 1ms abort timer reliably fires;
  // otherwise the loop can drain first and node:test cancels this test in CI.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    const decision = await authorize(
      { headers: { cookie: "session=abc" } },
      "doc-1",
    );

    assert.deepEqual(decision, { ok: false, status: 403 });
  } finally {
    clearInterval(keepAlive);
  }
});
