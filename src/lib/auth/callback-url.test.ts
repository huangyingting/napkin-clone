import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CALLBACK_URL, safeCallbackUrl } from "./callback-url";

test("accepts same-origin root-relative paths", () => {
  assert.equal(safeCallbackUrl("/"), "/");
  assert.equal(
    safeCallbackUrl("/app/settings/billing"),
    "/app/settings/billing",
  );
  assert.equal(safeCallbackUrl("/app?x=1#y"), "/app?x=1#y");
  assert.equal(safeCallbackUrl("/app/settings"), "/app/settings");
});

test("defaults missing callback URLs to the app dashboard", () => {
  assert.equal(safeCallbackUrl(undefined), "/app");
});

test("trims surrounding whitespace before validating", () => {
  assert.equal(safeCallbackUrl("  /app/settings  "), "/app/settings");
});

test("rejects protocol-relative URLs", () => {
  assert.equal(safeCallbackUrl("//evil.com"), DEFAULT_CALLBACK_URL);
  assert.equal(safeCallbackUrl("//evil.com/path"), DEFAULT_CALLBACK_URL);
});

test("rejects absolute URLs to a different origin", () => {
  assert.equal(safeCallbackUrl("https://evil.com"), DEFAULT_CALLBACK_URL);
  assert.equal(safeCallbackUrl("http://evil.com/app"), DEFAULT_CALLBACK_URL);
  assert.equal(
    safeCallbackUrl("https://evil.com/app/settings/billing"),
    DEFAULT_CALLBACK_URL,
  );
});

test("rejects backslash open-redirect tricks", () => {
  assert.equal(safeCallbackUrl("/\\evil.com"), DEFAULT_CALLBACK_URL);
  assert.equal(safeCallbackUrl("/\\/evil.com"), DEFAULT_CALLBACK_URL);
  assert.equal(safeCallbackUrl("\\\\evil.com"), DEFAULT_CALLBACK_URL);
  assert.equal(safeCallbackUrl("/app\\..\\evil"), DEFAULT_CALLBACK_URL);
});

test("rejects non-http(s) schemes", () => {
  assert.equal(safeCallbackUrl("javascript:alert(1)"), DEFAULT_CALLBACK_URL);
  assert.equal(safeCallbackUrl("javascript:void(0)//"), DEFAULT_CALLBACK_URL);
  assert.equal(safeCallbackUrl("data:text/html,evil"), DEFAULT_CALLBACK_URL);
  assert.equal(safeCallbackUrl("mailto:a@b.com"), DEFAULT_CALLBACK_URL);
});

test("rejects paths containing control characters", () => {
  assert.equal(safeCallbackUrl("/app\t/x"), DEFAULT_CALLBACK_URL);
  assert.equal(safeCallbackUrl("/app\n/x"), DEFAULT_CALLBACK_URL);
  assert.equal(safeCallbackUrl("/\u0000evil"), DEFAULT_CALLBACK_URL);
});

test("rejects values that are not root-relative", () => {
  assert.equal(safeCallbackUrl("app/settings"), DEFAULT_CALLBACK_URL);
  assert.equal(safeCallbackUrl("../etc/passwd"), DEFAULT_CALLBACK_URL);
  assert.equal(safeCallbackUrl(""), DEFAULT_CALLBACK_URL);
  assert.equal(safeCallbackUrl("   "), DEFAULT_CALLBACK_URL);
});

test("rejects non-string input", () => {
  assert.equal(safeCallbackUrl(undefined), DEFAULT_CALLBACK_URL);
  assert.equal(safeCallbackUrl(null), DEFAULT_CALLBACK_URL);
  assert.equal(safeCallbackUrl(42), DEFAULT_CALLBACK_URL);
  assert.equal(safeCallbackUrl(["/app"]), DEFAULT_CALLBACK_URL);
  assert.equal(
    safeCallbackUrl({ toString: () => "/app" }),
    DEFAULT_CALLBACK_URL,
  );
});
