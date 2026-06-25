import assert from "node:assert/strict";
import { test } from "node:test";

import { GenerationError } from "@/lib/ai/generate";

import {
  mapGenerateDeckError,
  parseDeckOptions,
  parseGenerateDeckPayload,
} from "./parser";

test("parseDeckOptions accepts current tuning fields", () => {
  assert.deepEqual(
    parseDeckOptions({ length: "short", tone: "clear", audience: "execs" }),
    {
      options: { length: "short", tone: "clear", audience: "execs" },
    },
  );
});

test("parseDeckOptions rejects superseded or invalid option shapes", () => {
  assert.deepEqual(parseDeckOptions("short"), {
    error: "`options` must be an object.",
  });
  assert.deepEqual(parseDeckOptions({ length: "tiny" }), {
    error: "`options.length` must be one of: short, medium, long.",
  });
});

test("parseGenerateDeckPayload preserves required content errors", () => {
  assert.deepEqual(parseGenerateDeckPayload({}), {
    ok: false,
    status: 400,
    message: "`contentJson` is required.",
  });
});

test("mapGenerateDeckError preserves generation failure contract", () => {
  assert.deepEqual(mapGenerateDeckError(new GenerationError("bad output")), {
    status: 502,
    message:
      "We couldn't generate a deck from that document. Please try again.",
    log: { reason: "generation-failed", status: 502 },
  });
});
