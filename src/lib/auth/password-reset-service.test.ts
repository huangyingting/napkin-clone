import assert from "node:assert/strict";
import test from "node:test";

import {
  configureAuthEmailDeliveryPort,
  type AuthEmailMessage,
} from "@/lib/auth/email";
import {
  GENERIC_PASSWORD_RESET_SENT_MESSAGE,
  requestPasswordResetForEmail,
} from "@/lib/auth/password-reset-service";
import type { prisma } from "@/lib/prisma";

function makeClient(user: { id: string; email: string } | null) {
  const tokens: Array<{ userId: string; tokenHash: string; expiresAt: Date }> =
    [];
  return {
    user: {
      findUnique() {
        return Promise.resolve(user);
      },
    },
    passwordResetToken: {
      create({
        data,
      }: {
        data: { userId: string; tokenHash: string; expiresAt: Date };
      }) {
        tokens.push(data);
        return Promise.resolve(data);
      },
    },
    _tokens: tokens,
  } as unknown as typeof prisma & {
    _tokens: Array<{ userId: string; tokenHash: string; expiresAt: Date }>;
  };
}

test("requestPasswordResetForEmail preserves anti-enumeration for unknown accounts", async () => {
  const client = makeClient(null);
  const delivered: AuthEmailMessage[] = [];
  configureAuthEmailDeliveryPort({
    async send(message) {
      delivered.push(message);
    },
  });

  try {
    const result = await requestPasswordResetForEmail(
      "unknown@example.com",
      client,
    );

    assert.deepEqual(result, {
      status: "sent",
      message: GENERIC_PASSWORD_RESET_SENT_MESSAGE,
    });
    assert.deepEqual(client._tokens, []);
    assert.deepEqual(delivered, []);
  } finally {
    configureAuthEmailDeliveryPort(null);
  }
});

test("requestPasswordResetForEmail stores only a hash and sends the raw-token URL", async () => {
  const client = makeClient({ id: "u1", email: "ada@example.com" });
  const delivered: AuthEmailMessage[] = [];
  configureAuthEmailDeliveryPort({
    async send(message) {
      delivered.push(message);
    },
  });

  try {
    const result = await requestPasswordResetForEmail(
      "ADA@example.com",
      client,
    );

    assert.deepEqual(result, {
      status: "sent",
      message: GENERIC_PASSWORD_RESET_SENT_MESSAGE,
    });
    assert.equal(client._tokens.length, 1);
    assert.equal(client._tokens[0]?.userId, "u1");
    assert.match(client._tokens[0]?.tokenHash ?? "", /^[0-9a-f]{64}$/);
    assert.equal(delivered[0]?.kind, "password-reset");
    assert.match(
      delivered[0]?.kind === "password-reset" ? delivered[0].resetUrl : "",
      /\/reset-password\?token=/,
    );
    assert.equal(
      delivered[0]?.kind === "password-reset"
        ? delivered[0].resetUrl.includes(client._tokens[0]?.tokenHash ?? "")
        : true,
      false,
    );
  } finally {
    configureAuthEmailDeliveryPort(null);
  }
});
