import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  isPublicAiDeckGenEnabled,
  publicAppUrl,
  publicCollabWsPort,
  publicCollabWsUrl,
} from "./client-config";

const MANAGED_VARS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_AI_DECK_GEN_ENABLED",
  "NEXT_PUBLIC_COLLAB_WS_URL",
  "NEXT_PUBLIC_COLLAB_WS_PORT",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of MANAGED_VARS) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of MANAGED_VARS) {
    if (saved[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = saved[name];
    }
  }
});

describe("publicAppUrl", () => {
  it("defaults to the local app origin", () => {
    assert.equal(publicAppUrl(), "http://localhost:4000");
  });

  it("returns the statically inlined public app URL when set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://textiq.example.com";
    assert.equal(publicAppUrl(), "https://textiq.example.com");
  });
});

describe("publicCollabWsUrl", () => {
  it("returns undefined when no explicit public websocket URL is configured", () => {
    assert.equal(publicCollabWsUrl(), undefined);
  });

  it("returns the explicit public websocket URL when set", () => {
    process.env.NEXT_PUBLIC_COLLAB_WS_URL = "wss://collab.example.com";
    assert.equal(publicCollabWsUrl(), "wss://collab.example.com");
  });
});

describe("publicCollabWsPort", () => {
  it("defaults to the inline app port", () => {
    assert.equal(publicCollabWsPort(), "4000");
  });

  it("returns the explicit SSR fallback port when set", () => {
    process.env.NEXT_PUBLIC_COLLAB_WS_PORT = "1234";
    assert.equal(publicCollabWsPort(), "1234");
  });
});

describe("isPublicAiDeckGenEnabled", () => {
  it("defaults to false", () => {
    assert.equal(isPublicAiDeckGenEnabled(), false);
  });

  it("accepts truthy opt-in values", () => {
    process.env.NEXT_PUBLIC_AI_DECK_GEN_ENABLED = "yes";
    assert.equal(isPublicAiDeckGenEnabled(), true);
  });
});
