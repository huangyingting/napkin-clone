import assert from "node:assert/strict";
import test from "node:test";

import {
  comparePassword,
  hashPassword,
  MIN_PASSWORD_LENGTH,
  PASSWORD_HASH_COST,
  validatePasswordChange,
} from "@/lib/auth/password";

test("accepts a long-enough password that matches its confirmation", () => {
  const result = validatePasswordChange({
    newPassword: "supersecret",
    confirmPassword: "supersecret",
  });
  assert.deepEqual(result, { ok: true });
});

test("accepts a password exactly at the minimum length", () => {
  const password = "a".repeat(MIN_PASSWORD_LENGTH);
  const result = validatePasswordChange({
    newPassword: password,
    confirmPassword: password,
  });
  assert.deepEqual(result, { ok: true });
});

test("rejects a password shorter than the minimum length", () => {
  const password = "a".repeat(MIN_PASSWORD_LENGTH - 1);
  const result = validatePasswordChange({
    newPassword: password,
    confirmPassword: password,
  });
  assert.equal(result.ok, false);
  assert.match(
    result.ok === false ? result.message : "",
    new RegExp(`${MIN_PASSWORD_LENGTH} characters`),
  );
});

test("the length check runs before the match check", () => {
  // Both fail (too short AND mismatched) — the length message wins so the user
  // fixes the more fundamental problem first.
  const result = validatePasswordChange({
    newPassword: "short",
    confirmPassword: "different",
  });
  assert.equal(result.ok, false);
  assert.match(
    result.ok === false ? result.message : "",
    new RegExp(`${MIN_PASSWORD_LENGTH} characters`),
  );
});

test("rejects a long-enough password that does not match its confirmation", () => {
  const result = validatePasswordChange({
    newPassword: "supersecret",
    confirmPassword: "supersecre7",
  });
  assert.equal(result.ok, false);
  assert.equal(
    result.ok === false ? result.message : "",
    "New passwords don't match.",
  );
});

test("hashPassword and comparePassword share the centralized bcrypt cost", async () => {
  const hash = await hashPassword("supersecret");

  assert.match(hash, /^\$2[aby]\$/);
  assert.match(hash, new RegExp(`^\\$2[aby]\\$${PASSWORD_HASH_COST}\\$`));
  assert.equal(await comparePassword("supersecret", hash), true);
  assert.equal(await comparePassword("wrong-secret", hash), false);
});
