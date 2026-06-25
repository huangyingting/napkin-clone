import assert from "node:assert/strict";
import test from "node:test";

import { deleteAccountForUser } from "@/lib/account/deletion-service";
import type { BillingProvider } from "@/lib/billing/provider";
import type { prisma } from "@/lib/prisma";

function makeClient(email: string | null) {
  const deleted: string[] = [];
  return {
    user: {
      findUnique() {
        return Promise.resolve(email ? { email } : null);
      },
      delete({ where }: { where: { id: string } }) {
        deleted.push(where.id);
        return Promise.resolve({ id: where.id });
      },
    },
    _deleted: deleted,
  } as unknown as typeof prisma & { _deleted: string[] };
}

function makeBillingProvider(
  calls: string[],
  shouldThrow = false,
): BillingProvider {
  return {
    async changePlan() {
      throw new Error("not used");
    },
    async cancelSubscription() {
      throw new Error("not used");
    },
    async cancelSubscriptionImmediately(userId: string) {
      calls.push(userId);
      if (shouldThrow) {
        throw new Error("stripe down");
      }
    },
  };
}

test("deleteAccountForUser validates confirmation before deleting", async () => {
  const client = makeClient("ada@example.com");

  const result = await deleteAccountForUser(
    { userId: "u1", confirmation: "wrong" },
    { client },
  );

  assert.deepEqual(result, {
    ok: false,
    error: 'Type your email or "DELETE" to confirm.',
  });
  assert.deepEqual(client._deleted, []);
});

test("deleteAccountForUser attempts billing cancellation and still deletes if cancellation fails", async () => {
  const client = makeClient("ada@example.com");
  const cancelCalls: string[] = [];
  const logs: string[] = [];
  const audits: Array<{ event: string; context: Record<string, unknown> }> = [];

  const result = await deleteAccountForUser(
    { userId: "u1", confirmation: "ADA@example.com" },
    {
      client,
      getCancellationState: async () => ({
        stripeSubscriptionId: "sub_123",
        status: "active",
      }),
      getProvider: async () => makeBillingProvider(cancelCalls, true),
      log(scope) {
        logs.push(scope);
      },
      audit(event, context) {
        audits.push({ event, context: context ?? {} });
      },
    },
  );

  assert.deepEqual(result, { ok: true, data: undefined });
  assert.deepEqual(cancelCalls, ["u1"]);
  assert.deepEqual(logs, ["billing.subscription.cancel_immediate"]);
  assert.deepEqual(audits[0], {
    event: "account.deletion.billing_reconciliation_required",
    context: {
      userId: "u1",
      subscriptionId: "sub_123",
      status: "active",
      reason: "stripe-cancellation-failed",
      outcome: "failed",
    },
  });
  assert.deepEqual(client._deleted, ["u1"]);
});

test("deleteAccountForUser skips billing cancellation for terminal subscriptions", async () => {
  const client = makeClient("ada@example.com");
  const cancelCalls: string[] = [];

  const result = await deleteAccountForUser(
    { userId: "u1", confirmation: "DELETE" },
    {
      client,
      getCancellationState: async () => ({
        stripeSubscriptionId: "sub_123",
        status: "cancelled",
      }),
      getProvider: async () => makeBillingProvider(cancelCalls),
      audit() {},
    },
  );

  assert.deepEqual(result, { ok: true, data: undefined });
  assert.deepEqual(cancelCalls, []);
  assert.deepEqual(client._deleted, ["u1"]);
});
