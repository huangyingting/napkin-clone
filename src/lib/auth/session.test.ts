import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { requireUserCore, type CurrentUser } from "@/lib/session";

function redirectRecorder() {
  const calls: string[] = [];
  return {
    calls,
    redirect(url: string): never {
      calls.push(url);
      throw new Error(`redirect:${url}`);
    },
  };
}

describe("requireUserCore", () => {
  test("redirects anonymous sessions to login before querying users", async () => {
    const redirects = redirectRecorder();
    let queried = false;

    await assert.rejects(
      requireUserCore(
        {
          async getCurrentUser() {
            return null;
          },
          async findUserById() {
            queried = true;
            return { id: "unused" };
          },
        },
        redirects.redirect,
      ),
      /redirect:\/login/,
    );

    assert.deepEqual(redirects.calls, ["/login"]);
    assert.equal(queried, false);
  });

  test("redirects stale sessions to signout when the user row is gone", async () => {
    const redirects = redirectRecorder();

    await assert.rejects(
      requireUserCore(
        {
          async getCurrentUser() {
            return { id: "user-missing" } as CurrentUser;
          },
          async findUserById(id) {
            assert.equal(id, "user-missing");
            return null;
          },
        },
        redirects.redirect,
      ),
      /redirect:\/signout/,
    );

    assert.deepEqual(redirects.calls, ["/signout"]);
  });

  test("returns the session user when the backing user row exists", async () => {
    const user = { id: "user-1", email: "ada@example.test" } as CurrentUser;
    const redirects = redirectRecorder();

    const result = await requireUserCore(
      {
        async getCurrentUser() {
          return user;
        },
        async findUserById(id) {
          assert.equal(id, "user-1");
          return { id };
        },
      },
      redirects.redirect,
    );

    assert.equal(result, user);
    assert.deepEqual(redirects.calls, []);
  });
});
