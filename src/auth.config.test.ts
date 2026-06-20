import assert from "node:assert/strict";
import { test } from "node:test";

import { authConfig } from "./auth.config";

const authorized = authConfig.callbacks!.authorized!;

type AuthorizedArg = Parameters<typeof authorized>[0];

function callAuthorized(isLoggedIn: boolean, pathname: string) {
  return authorized({
    auth: isLoggedIn ? ({ user: { id: "u1" } } as never) : null,
    request: { nextUrl: new URL(`http://localhost${pathname}`) },
  } as AuthorizedArg);
}

test("redirects signed-out users away from protected /app routes", () => {
  // Returning `false` instructs Auth.js to redirect to the sign-in page with a
  // `callbackUrl` back to the originally requested protected route.
  assert.equal(callAuthorized(false, "/app/settings/billing"), false);
  assert.equal(callAuthorized(false, "/app"), false);
});

test("allows signed-in users into protected /app routes", () => {
  assert.equal(callAuthorized(true, "/app/settings/billing"), true);
  assert.equal(callAuthorized(true, "/app"), true);
});

test("allows everyone through public routes", () => {
  assert.equal(callAuthorized(false, "/"), true);
  assert.equal(callAuthorized(false, "/login"), true);
  assert.equal(callAuthorized(false, "/signup"), true);
});

test("redirects signed-in users away from the auth pages", () => {
  for (const path of ["/login", "/signup"]) {
    const result = callAuthorized(true, path);
    assert.ok(result instanceof Response, `${path} should redirect`);
    assert.ok(
      (result as Response).status >= 300 && (result as Response).status < 400,
    );
    assert.equal(
      (result as Response).headers.get("location"),
      "http://localhost/app",
    );
  }
});
