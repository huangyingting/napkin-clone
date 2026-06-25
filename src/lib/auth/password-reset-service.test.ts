import assert from "node:assert/strict";
import test from "node:test";

import {
  configureAuthEmailDeliveryPort,
  type AuthEmailMessage,
} from "@/lib/auth/email";
import {
  GENERIC_PASSWORD_RESET_SENT_MESSAGE,
  requestPasswordResetForEmail,
  resetPasswordWithToken,
} from "@/lib/auth/password-reset-service";
import {
  RESET_TOKEN_REJECTION_MESSAGE,
  hashResetToken,
} from "@/lib/auth/reset-token";
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

function makeResetClient(rawToken: string) {
  const token = {
    id: "prt_1",
    userId: "u1",
    tokenHash: hashResetToken(rawToken),
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null as Date | null,
  };
  const passwordHashes: string[] = [];
  const client = {
    user: {
      update({
        where,
        data,
      }: {
        where: { id: string };
        data: { passwordHash: string };
      }) {
        assert.equal(where.id, "u1");
        passwordHashes.push(data.passwordHash);
        return Promise.resolve({ id: where.id, ...data });
      },
    },
    passwordResetToken: {
      findUnique({ where }: { where: { tokenHash: string } }) {
        return Promise.resolve(
          where.tokenHash === token.tokenHash ? token : null,
        );
      },
      updateMany({
        where,
        data,
      }: {
        where: {
          id?: string | { not: string };
          userId?: string;
          usedAt?: null;
          expiresAt?: { gt: Date };
        };
        data: { usedAt: Date };
      }) {
        if (where.id === token.id) {
          const canConsume =
            token.usedAt === null &&
            (!where.expiresAt || token.expiresAt > where.expiresAt.gt);
          if (canConsume) {
            token.usedAt = data.usedAt;
            return Promise.resolve({ count: 1 });
          }
          return Promise.resolve({ count: 0 });
        }
        return Promise.resolve({ count: 0 });
      },
    },
    $transaction<T>(fn: (tx: unknown) => Promise<T>) {
      return fn(client);
    },
    _passwordHashes: passwordHashes,
  };
  return client as unknown as typeof prisma & { _passwordHashes: string[] };
}

test("requestPasswordResetForEmail preserves anti-enumeration for unknown accounts", async () => {
  const client = makeClient(null);
  const delivered: AuthEmailMessage[] = [];
  const originalInfo = console.info;
  console.info = () => {};
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
    console.info = originalInfo;
    configureAuthEmailDeliveryPort(null);
  }
});

test("requestPasswordResetForEmail stores only a hash and sends the raw-token URL", async () => {
  const client = makeClient({ id: "u1", email: "ada@example.com" });
  const delivered: AuthEmailMessage[] = [];
  const originalInfo = console.info;
  console.info = () => {};
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
    console.info = originalInfo;
    configureAuthEmailDeliveryPort(null);
  }
});

test("resetPasswordWithToken consumes the token with a race-safe conditional update", async () => {
  const client = makeResetClient("raw-reset-token");
  const originalInfo = console.info;
  console.info = () => {};

  let results: Array<Awaited<ReturnType<typeof resetPasswordWithToken>>> = [];
  try {
    results = await Promise.all([
      resetPasswordWithToken(
        {
          token: "raw-reset-token",
          newPassword: "new-password-1",
          confirmPassword: "new-password-1",
        },
        client,
      ),
      resetPasswordWithToken(
        {
          token: "raw-reset-token",
          newPassword: "new-password-2",
          confirmPassword: "new-password-2",
        },
        client,
      ),
    ]);
  } finally {
    console.info = originalInfo;
  }

  assert.equal(
    results.filter((result) => result.status === "success").length,
    1,
  );
  assert.equal(
    results.filter(
      (result) =>
        result.status === "error" &&
        result.message === RESET_TOKEN_REJECTION_MESSAGE.used,
    ).length,
    1,
  );
  assert.equal(client._passwordHashes.length, 1);
});
