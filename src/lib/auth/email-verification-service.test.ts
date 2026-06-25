import assert from "node:assert/strict";
import test from "node:test";

import { consumeEmailVerificationToken } from "@/lib/auth/email-verification-service";
import {
  VERIFICATION_TOKEN_REJECTION_MESSAGE,
  hashVerificationToken,
} from "@/lib/auth/verification-token";
import type { prisma } from "@/lib/prisma";

function makeVerificationClient(rawToken: string) {
  const token = {
    id: "evt_1",
    userId: "u1",
    tokenHash: hashVerificationToken(rawToken),
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null as Date | null,
  };
  const verifiedAt: Date[] = [];
  const client = {
    user: {
      update({
        where,
        data,
      }: {
        where: { id: string };
        data: { emailVerified: Date };
      }) {
        assert.equal(where.id, "u1");
        verifiedAt.push(data.emailVerified);
        return Promise.resolve({ id: where.id, ...data });
      },
    },
    emailVerificationToken: {
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
    _verifiedAt: verifiedAt,
  };
  return client as unknown as typeof prisma & { _verifiedAt: Date[] };
}

test("consumeEmailVerificationToken allows exactly one concurrent consumer", async () => {
  const client = makeVerificationClient("raw-verification-token");
  const originalInfo = console.info;
  console.info = () => {};

  let results: Array<
    Awaited<ReturnType<typeof consumeEmailVerificationToken>>
  > = [];
  try {
    results = await Promise.all([
      consumeEmailVerificationToken("raw-verification-token", client),
      consumeEmailVerificationToken("raw-verification-token", client),
    ]);
  } finally {
    console.info = originalInfo;
  }

  assert.equal(
    results.filter((result) => result.status === "verified").length,
    1,
  );
  assert.equal(
    results.filter(
      (result) =>
        result.status === "error" &&
        result.message === VERIFICATION_TOKEN_REJECTION_MESSAGE.used,
    ).length,
    1,
  );
  assert.equal(client._verifiedAt.length, 1);
});
