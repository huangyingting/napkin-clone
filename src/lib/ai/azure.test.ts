import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { azureChatComplete, type AzureConfig } from "@/lib/ai/azure";
import type { ChatMessage } from "@/lib/ai/prompt";

// ---------------------------------------------------------------------------
// Helpers — stub the global `fetch` so we can assert on the request body the
// Azure client builds without doing any network I/O.
// ---------------------------------------------------------------------------

const CONFIG: AzureConfig = {
  endpoint: "https://example.openai.azure.com",
  apiKey: "test-key",
  deployment: "gpt-5.5",
  apiVersion: "2024-10-21",
};

const MESSAGES: ChatMessage[] = [{ role: "user", content: "hi" }];

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/**
 * Replaces `globalThis.fetch` with a stub that records the parsed JSON body of
 * the request and returns a minimal valid chat-completion response. Returns a
 * getter for the captured body.
 */
function stubFetch(): () => Record<string, unknown> {
  let captured: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    captured = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  return () => captured;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("includes the provided maxOutputTokens as max_completion_tokens", async () => {
  const getBody = stubFetch();

  await azureChatComplete(MESSAGES, {
    config: CONFIG,
    maxOutputTokens: 16000,
  });

  assert.equal(getBody().max_completion_tokens, 16000);
});

test("defaults max_completion_tokens when maxOutputTokens is omitted", async () => {
  const getBody = stubFetch();

  await azureChatComplete(MESSAGES, { config: CONFIG });

  // A sensible non-zero default is applied so /api/generate callers that do not
  // pass a cap keep working unchanged.
  assert.equal(getBody().max_completion_tokens, 4000);
});

test("requests JSON-object response mode", async () => {
  const getBody = stubFetch();

  await azureChatComplete(MESSAGES, { config: CONFIG });

  assert.deepEqual(getBody().response_format, { type: "json_object" });
});
