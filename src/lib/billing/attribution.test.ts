import assert from "node:assert/strict";
import test from "node:test";

import { shouldShowAttribution } from "./attribution";

test("shouldShowAttribution: free plan → show badge", () => {
  assert.equal(shouldShowAttribution("free"), true);
});

test("shouldShowAttribution: plus plan → hide badge", () => {
  assert.equal(shouldShowAttribution("plus"), false);
});

test("shouldShowAttribution: pro plan → hide badge", () => {
  assert.equal(shouldShowAttribution("pro"), false);
});

test("shouldShowAttribution: unknown plan → show badge (fail-open)", () => {
  assert.equal(shouldShowAttribution("enterprise"), true);
  assert.equal(shouldShowAttribution(""), true);
  assert.equal(shouldShowAttribution("PLUS"), true);
});
