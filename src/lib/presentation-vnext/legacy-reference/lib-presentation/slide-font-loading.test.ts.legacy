import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadSlideFonts } from "./slide-font-loading";

describe("loadSlideFonts (non-DOM)", () => {
  it("resolves without throwing when document is unavailable", async () => {
    assert.equal(typeof document, "undefined");
    await assert.doesNotReject(() => loadSlideFonts());
    await assert.doesNotReject(() => loadSlideFonts(["inter"]));
  });

  it("loads matching browser font assets and ignores load/readiness failures", async () => {
    const originalDocument = globalThis.document;
    const loadedSpecs: string[] = [];
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        fonts: {
          load(spec: string) {
            loadedSpecs.push(spec);
            if (spec.startsWith("italic ")) {
              throw new Error("font rejected");
            }
            return Promise.resolve([]);
          },
          ready: Promise.reject(new Error("readiness unavailable")),
        },
      },
    });

    try {
      await assert.doesNotReject(() => loadSlideFonts(["inter", "missing"]));
    } finally {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    }

    assert.deepEqual(loadedSpecs, [
      '400 16px "Inter"',
      '600 16px "Inter"',
      '700 16px "Inter"',
      'italic 400 16px "Inter"',
    ]);
  });
});
