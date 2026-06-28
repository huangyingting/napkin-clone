import assert from "node:assert/strict";
import { test } from "node:test";

import {
  queryIsPointerCoarse,
  queryIsPointerFine,
  queryIsWideViewport,
  subscribePointerFine,
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
  assert.equal(queryIsPointerFine(), true);
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
  assert.equal(queryIsPointerCoarse(), false);
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
  assert.equal(queryIsWideViewport(), true);
});

test("subscribePointerFine wires change listener and cleanup", () => {
  let receivedQuery = "";
  let addedHandler: ((event: MediaQueryListEvent) => void) | undefined;
  let removedHandler: ((event: MediaQueryListEvent) => void) | undefined;
  const values: boolean[] = [];

  const unsubscribe = subscribePointerFine(
    (matches) => values.push(matches),
    (query) => {
      receivedQuery = query;
      return {
        matches: false,
        media: query,
        onchange: null,
        addEventListener: (_type: string, handler: EventListener) => {
          addedHandler = handler as (event: MediaQueryListEvent) => void;
        },
        removeEventListener: (_type: string, handler: EventListener) => {
          removedHandler = handler as (event: MediaQueryListEvent) => void;
        },
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => true,
      };
    },
  );

  assert.equal(receivedQuery, "(pointer: fine)");
  assert.ok(addedHandler);
  addedHandler({ matches: true } as MediaQueryListEvent);
  unsubscribe();

  assert.deepEqual(values, [true]);
  assert.equal(removedHandler, addedHandler);
});
