import assert from "node:assert/strict";
import { test } from "node:test";

import { NextResponse } from "next/server";

import { GenerateTimeoutError } from "@/lib/ai/deadline";
import { GenerationError } from "@/lib/ai/generate";
import {
  createGenerationRouteHandler,
  readJsonObject,
  type GenerationRouteConfig,
  type GenerationRouteDeps,
  type GenerationRouteRequest,
  type PayloadParseResult,
} from "@/lib/ai/generation-route";
import {
  ANON_COOKIE_NAME,
  newAnonState,
  parseAnonCookie,
  signAnonState,
} from "@/lib/ai/quota";
import { InsufficientCreditsError } from "@/lib/billing/credits";
import type { MeteredUsageReservation } from "@/lib/billing/metered-usage";

interface FakePayload {
  text: string;
}

interface FakeResult {
  value: string;
}

interface FakeState {
  user: { id: string } | null;
  now: number;
  balance: number;
  rateAllowed: boolean;
  rateResetAt: number;
  generateError: Error | null;
  generated: number;
  reserved: unknown[];
  captured: unknown[];
  refunded: unknown[];
  deducted: unknown[];
  denials: unknown[];
  logs: unknown[];
  subjects: string[];
}

const SECRET = "test-secret";
const PERIOD_END = new Date("2026-07-01T00:00:00Z");

function parsePayload(
  body: Record<string, unknown>,
): PayloadParseResult<FakePayload> {
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    return { ok: false, status: 400, message: "`text` is required." };
  }
  return { ok: true, payload: { text } };
}

function createConfig(
  state: FakeState,
): GenerationRouteConfig<FakePayload, FakeResult> {
  return {
    logScope: "api.fake-generate",
    operation: "fake-generate",
    rateLimitSubjects: {
      user: "fake-user",
      anonymousIp: "fake-anon-ip",
    },
    anonymousQuotaExceededMessage:
      "You've used all your free generations. Sign in to keep creating fakes.",
    unexpectedErrorMessage: "Unexpected error while generating fakes.",
    parsePayload,
    creditText: (payload) => payload.text,
    generate: async ({ payload }) => {
      state.generated += 1;
      if (state.generateError) {
        throw state.generateError;
      }
      return { value: payload.text.toUpperCase() };
    },
    successResponse: (result) => NextResponse.json({ result }),
    mapGenerationError: (error) => {
      if (error instanceof GenerationError) {
        return {
          status: 502,
          message:
            "We couldn't generate fakes from that text. Please try again.",
          log: { reason: "generation-failed", status: 502 },
        };
      }
      return null;
    },
  };
}

function createState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    user: { id: "user-1" },
    now: Date.parse("2026-06-25T00:00:00Z"),
    balance: 10,
    rateAllowed: true,
    rateResetAt: Date.parse("2026-06-25T00:01:00Z"),
    generateError: null,
    generated: 0,
    reserved: [],
    captured: [],
    refunded: [],
    deducted: [],
    denials: [],
    logs: [],
    subjects: [],
    ...overrides,
  };
}

function createDeps(state: FakeState): GenerationRouteDeps {
  return {
    requestId: () => "request-1",
    now: () => state.now,
    getSecret: () => SECRET,
    getAzureConfig: () => ({
      endpoint: "https://example.openai.azure.com",
      apiKey: "key",
      deployment: "deployment",
      apiVersion: "2024-10-21",
    }),
    azureChatComplete: async () => "{}",
    withAbortDeadline: (factory) => factory(new AbortController().signal),
    timeoutMs: 45_000,
    getCurrentUser: async () => state.user,
    rateLimitStore: {
      async get() {
        return undefined;
      },
      async set() {},
    },
    checkRateLimitWithStore: async (_store, key) => {
      state.subjects.push(key);
      return {
        allowed: state.rateAllowed,
        remaining: state.rateAllowed ? 9 : 0,
        limit: 10,
        resetAt: state.rateResetAt,
      };
    },
    rateLimitSubject: (scope, identifier) => `${scope}:${identifier}`,
    userRateLimit: () => 10,
    userRateWindowMs: () => 60_000,
    anonIpRateLimit: () => 10,
    anonIpRateWindowMs: () => 60_000,
    retryAfterSeconds: (resetAt, now) =>
      Math.max(1, Math.ceil((resetAt - now) / 1000)),
    getClientIp: (headers) => headers.get("x-forwarded-for"),
    hashIdentifier: (identifier, secret) => `hash:${secret}:${identifier}`,
    anonTrialLimit: () => 5,
    parseAnonCookie,
    newAnonState,
    signAnonState,
    reserveMeteredUsage: async (opts) => {
      const creditCost = opts.creditText
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
      if (state.balance < creditCost) {
        return {
          ok: false,
          reason: "insufficient-credits",
          creditCost,
          balance: state.balance,
          periodEnd: PERIOD_END,
          message:
            `Insufficient credits: you need ${creditCost} but have ${state.balance}. ` +
            `Your credits reset on ${PERIOD_END.toLocaleDateString()}. ` +
            "Upgrade your plan or wait for your credits to reset.",
        };
      }
      const reservation: MeteredUsageReservation = {
        idempotencyKey: opts.idempotencyKey,
        userId: opts.userId,
        operation: opts.operation,
        creditCost,
        ledgerReserved: creditCost > 0,
      };
      state.reserved.push(opts);
      return { ok: true, reservation };
    },
    captureMeteredUsage: async (reservation) => {
      state.captured.push(reservation);
      return { ok: true };
    },
    refundMeteredUsage: async (reservation) => {
      state.refunded.push(reservation);
    },
    isAzureConfigError: () => false,
    isTimeoutError: (error) => error instanceof GenerateTimeoutError,
    isInsufficientCreditsError: (error) =>
      error instanceof InsufficientCreditsError,
    logError: (_scope, error, fields) => {
      state.logs.push({ error, fields });
    },
    logRouteDenial: (opts) => {
      state.denials.push(opts);
    },
  };
}

function createRequest(
  body: unknown,
  options: { headers?: HeadersInit; cookies?: Record<string, string> } = {},
): GenerationRouteRequest {
  const cookies = new Map(Object.entries(options.cookies ?? {}));
  return {
    async json() {
      if (body instanceof Error) {
        throw body;
      }
      return body;
    },
    headers: new Headers(options.headers),
    cookies: {
      get(name) {
        const value = cookies.get(name);
        return value === undefined ? undefined : { value };
      },
    },
  };
}

async function responseJson(response: Response): Promise<unknown> {
  return response.json();
}

test("readJsonObject returns route-compatible invalid payload errors", async () => {
  const invalidJson = await readJsonObject(
    createRequest(new Error("bad json")),
  );
  assert.equal(invalidJson.ok, false);
  assert.equal(invalidJson.response.status, 400);
  assert.deepEqual(await responseJson(invalidJson.response), {
    error: "Request body must be valid JSON.",
  });

  const nonObject = await readJsonObject(createRequest([]));
  assert.equal(nonObject.ok, false);
  assert.equal(nonObject.response.status, 400);
  assert.deepEqual(await responseJson(nonObject.response), {
    error: "Request body must be a JSON object.",
  });
});

test("authenticated success reserves then captures credits without setting anon cookie", async () => {
  const state = createState();
  const handler = createGenerationRouteHandler(
    createConfig(state),
    createDeps(state),
  );

  const response = await handler(createRequest({ text: "hello world" }));

  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), {
    result: { value: "HELLO WORLD" },
  });
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(state.subjects[0], "fake-user:user-1");
  assert.equal(state.generated, 1);
  assert.equal(state.reserved.length, 1);
  assert.equal(state.captured.length, 1);
  assert.equal(state.refunded.length, 0);
});

test("anonymous success increments the signed one-year trial cookie", async () => {
  const state = createState({ user: null });
  const handler = createGenerationRouteHandler(
    createConfig(state),
    createDeps(state),
  );

  const response = await handler(
    createRequest(
      { text: "hello anon" },
      { headers: { "x-forwarded-for": "203.0.113.1" } },
    ),
  );

  assert.equal(response.status, 200);
  assert.equal(state.subjects[0], "fake-anon-ip:hash:test-secret:203.0.113.1");
  assert.equal(state.reserved.length, 0);
  assert.equal(state.captured.length, 0);

  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  assert.ok(setCookie.startsWith(`${ANON_COOKIE_NAME}=`));
  assert.match(setCookie, /Max-Age=31536000/);
  assert.match(setCookie, /HttpOnly/);
  const value = setCookie.split(";")[0]?.slice(`${ANON_COOKIE_NAME}=`.length);
  assert.ok(value);
  const parsed = parseAnonCookie(value, SECRET);
  assert.equal(parsed?.count, 1);
});

test("rate limit returns 429 with Retry-After before generation", async () => {
  const state = createState({
    rateAllowed: false,
    rateResetAt: Date.parse("2026-06-25T00:00:09Z"),
  });
  const handler = createGenerationRouteHandler(
    createConfig(state),
    createDeps(state),
  );

  const response = await handler(createRequest({ text: "hello world" }));

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "9");
  assert.deepEqual(await responseJson(response), {
    error: "Rate limit exceeded. Please wait a moment and try again.",
    code: "RATE_LIMITED",
  });
  assert.equal(state.generated, 0);
  assert.equal(state.denials.length, 1);
});

test("insufficient credits returns 402 before reserve or generation", async () => {
  const state = createState({ balance: 1 });
  const handler = createGenerationRouteHandler(
    createConfig(state),
    createDeps(state),
  );

  const response = await handler(createRequest({ text: "hello world" }));

  assert.equal(response.status, 402);
  assert.deepEqual(await responseJson(response), {
    error:
      "Insufficient credits: you need 2 but have 1. " +
      `Your credits reset on ${PERIOD_END.toLocaleDateString()}. ` +
      "Upgrade your plan or wait for your credits to reset.",
    code: "PAYMENT_REQUIRED",
  });
  assert.equal(state.generated, 0);
  assert.equal(state.reserved.length, 0);
  assert.equal(state.denials.length, 1);
});

test("timeout refunds reserved usage and preserves 504 semantics", async () => {
  const state = createState({
    generateError: new GenerateTimeoutError(45_000),
  });
  const handler = createGenerationRouteHandler(
    createConfig(state),
    createDeps(state),
  );

  const response = await handler(createRequest({ text: "hello world" }));

  assert.equal(response.status, 504);
  assert.deepEqual(await responseJson(response), {
    error: "The AI took too long to respond. Please try again.",
    code: "SERVER_ERROR",
  });
  assert.equal(state.reserved.length, 1);
  assert.equal(state.captured.length, 0);
  assert.equal(state.refunded.length, 1);
  assert.equal(state.denials.length, 1);
});

test("generation failure refunds reserved usage and preserves 502 semantics", async () => {
  const state = createState({
    generateError: new GenerationError("invalid model output"),
  });
  const handler = createGenerationRouteHandler(
    createConfig(state),
    createDeps(state),
  );

  const response = await handler(createRequest({ text: "hello world" }));

  assert.equal(response.status, 502);
  assert.deepEqual(await responseJson(response), {
    error: "We couldn't generate fakes from that text. Please try again.",
    code: "SERVER_ERROR",
  });
  assert.equal(state.reserved.length, 1);
  assert.equal(state.captured.length, 0);
  assert.equal(state.refunded.length, 1);
  assert.equal(state.logs.length, 1);
});
