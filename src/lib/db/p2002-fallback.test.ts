import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { withP2002Fallback } from "./p2002-fallback";

describe("withP2002Fallback", () => {
  it("returns the result of createFn when it succeeds", async () => {
    const result = await withP2002Fallback(
      async () => ({ id: "asset-new" }),
      async () => null,
    );
    assert.deepEqual(result, { id: "asset-new" });
  });

  it("calls recoverFn and returns its result when createFn throws P2002", async () => {
    const p2002 = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });
    const result = await withP2002Fallback(
      async () => {
        throw p2002;
      },
      async () => ({ id: "asset-winner" }),
    );
    assert.deepEqual(result, { id: "asset-winner" });
  });

  it("re-throws P2002 when recoverFn returns null (winner row missing)", async () => {
    const p2002 = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });
    await assert.rejects(
      () =>
        withP2002Fallback(
          async () => {
            throw p2002;
          },
          async () => null,
        ),
      (err: unknown) => (err as { code?: string }).code === "P2002",
    );
  });

  it("re-throws non-P2002 errors unchanged", async () => {
    const otherError = new Error("Unexpected DB error");
    await assert.rejects(
      () =>
        withP2002Fallback(
          async () => {
            throw otherError;
          },
          async () => ({ id: "should-not-reach" }),
        ),
      otherError,
    );
  });
});
