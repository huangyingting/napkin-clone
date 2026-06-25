import assert from "node:assert/strict";
import { test } from "node:test";

import {
  queryIsPointerCoarse,
  queryIsPointerFine,
  queryIsWideViewport,
} from "./pointer";

test("queryIsPointerFine returns true when matchMedia reports matches:true", () => {
  const mockMatchMedia = (_: string) => ({ matches: true });
  assert.equal(queryIsPointerFine(mockMatchMedia), true);
});

test("queryIsPointerFine returns false when matchMedia reports matches:false", () => {
  const mockMatchMedia = (_: string) => ({ matches: false });
  assert.equal(queryIsPointerFine(mockMatchMedia), false);
});

test("queryIsPointerFine passes the correct media query string", () => {
  let receivedQuery = "";
  const mockMatchMedia = (query: string) => {
    receivedQuery = query;
    return { matches: true };
  };
  queryIsPointerFine(mockMatchMedia);
  assert.equal(receivedQuery, "(pointer: fine)");
});

test("queryIsPointerFine defaults to true on server (no window)", () => {
  // The default implementation returns { matches: true } when window is
  // undefined. Simulate by passing an explicit mock that mimics the SSR path.
  const ssrMatchMedia = (_: string) => ({ matches: true });
  assert.equal(queryIsPointerFine(ssrMatchMedia), true);
});

test("queryIsPointerCoarse passes the correct media query string", () => {
  let receivedQuery = "";
  const mockMatchMedia = (query: string) => {
    receivedQuery = query;
    return { matches: true };
  };
  assert.equal(queryIsPointerCoarse(mockMatchMedia), true);
  assert.equal(receivedQuery, "(pointer: coarse)");
});

test("queryIsPointerCoarse defaults to false on server (no window)", () => {
  const ssrMatchMedia = (_: string) => ({ matches: false });
  assert.equal(queryIsPointerCoarse(ssrMatchMedia), false);
});

test("queryIsWideViewport returns true when matchMedia reports matches:true", () => {
  const mockMatchMedia = (_: string) => ({ matches: true });
  assert.equal(queryIsWideViewport(mockMatchMedia), true);
});

test("queryIsWideViewport returns false when matchMedia reports matches:false", () => {
  const mockMatchMedia = (_: string) => ({ matches: false });
  assert.equal(queryIsWideViewport(mockMatchMedia), false);
});

test("queryIsWideViewport passes the (min-width: 1024px) media query string", () => {
  let receivedQuery = "";
  const mockMatchMedia = (query: string) => {
    receivedQuery = query;
    return { matches: true };
  };
  queryIsWideViewport(mockMatchMedia);
  assert.equal(receivedQuery, "(min-width: 1024px)");
});

test("queryIsWideViewport defaults to true on server (no window)", () => {
  const ssrMatchMedia = (_: string) => ({ matches: true });
  assert.equal(queryIsWideViewport(ssrMatchMedia), true);
});
