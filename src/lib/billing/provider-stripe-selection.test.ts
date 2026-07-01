import assert from "node:assert/strict";
import { test } from "node:test";

import { StripeBillingProvider } from "@/lib/billing/stripe-provider";

async function loadProviderModule(): Promise<typeof import("./provider")> {
  return import("./provider");
}

async function withBillingEnv<T>(
  env: { NODE_ENV: string; STRIPE_SECRET_KEY?: string },
  run: () => Promise<T>,
): Promise<T> {
  const processEnv = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousStripeKey = process.env.STRIPE_SECRET_KEY;
  processEnv.NODE_ENV = env.NODE_ENV;
  if (env.STRIPE_SECRET_KEY === undefined) {
    delete process.env.STRIPE_SECRET_KEY;
  } else {
    process.env.STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;
  }
  try {
    return await run();
  } finally {
    if (previousNodeEnv === undefined) {
      delete processEnv.NODE_ENV;
    } else {
      processEnv.NODE_ENV = previousNodeEnv;
    }
    if (previousStripeKey === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = previousStripeKey;
    }
  }
}

test("getBillingProvider selects Stripe when a Stripe key is configured", async () => {
  await withBillingEnv(
    { NODE_ENV: "production", STRIPE_SECRET_KEY: "sk_test_configured" },
    async () => {
      const { getBillingProvider } = await loadProviderModule();
      const provider = await getBillingProvider();
      assert.ok(provider instanceof StripeBillingProvider);
      assert.strictEqual(await getBillingProvider(), provider);
    },
  );
});
