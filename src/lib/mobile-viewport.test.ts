import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mobileViewportCssVars,
  resolveMobileViewportSize,
} from "./mobile-viewport";

test("resolveMobileViewportSize uses visualViewport when present", () => {
  assert.deepEqual(
    resolveMobileViewportSize({
      innerWidth: 390,
      innerHeight: 844,
      visualViewport: {
        width: 390.4,
        height: 512.6,
        offsetTop: 288.2,
        offsetLeft: 0,
      },
    }),
    { width: 390, height: 513, offsetTop: 288, offsetLeft: 0 },
  );
});

test("resolveMobileViewportSize falls back to layout viewport", () => {
  assert.deepEqual(
    resolveMobileViewportSize({ innerWidth: 1024, innerHeight: 768 }),
    { width: 1024, height: 768, offsetTop: 0, offsetLeft: 0 },
  );
});

test("mobileViewportCssVars serializes pixel CSS variables", () => {
  assert.deepEqual(
    mobileViewportCssVars({
      width: 390,
      height: 513,
      offsetTop: 288,
      offsetLeft: 4,
    }),
    {
      "--tiq-viewport-height": "513px",
      "--tiq-viewport-width": "390px",
      "--tiq-viewport-offset-top": "288px",
      "--tiq-viewport-offset-left": "4px",
    },
  );
});
