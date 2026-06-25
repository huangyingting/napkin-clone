import assert from "node:assert/strict";
import { test } from "node:test";

import {
  authorizeCredentialsUser,
  type AuthorizedCredentialsUser,
} from "@/lib/auth/credentials-service";
import { hashPassword } from "@/lib/auth/password";

type CredentialAuthClient = NonNullable<
  Parameters<typeof authorizeCredentialsUser>[1]
>;

function credentialClient(
  user: (AuthorizedCredentialsUser & { passwordHash: string | null }) | null,
  observedEmails: string[] = [],
): CredentialAuthClient {
  return {
    user: {
      findUnique: async ({ where }: { where: { email: string } }) => {
        observedEmails.push(where.email);
        return user;
      },
    },
  } as unknown as CredentialAuthClient;
}

test("authorizeCredentialsUser normalizes email and returns the DB user on password match", async () => {
  const passwordHash = await hashPassword("correct-password");
  const observedEmails: string[] = [];
  const client = credentialClient(
    {
      id: "user_1",
      email: "person@example.com",
      name: "Person",
      image: "https://example.com/avatar.png",
      passwordHash,
    },
    observedEmails,
  );

  const authorized = await authorizeCredentialsUser(
    { email: "  PERSON@EXAMPLE.COM ", password: "correct-password" },
    client,
  );

  assert.deepEqual(observedEmails, ["person@example.com"]);
  assert.deepEqual(authorized, {
    id: "user_1",
    email: "person@example.com",
    name: "Person",
    image: "https://example.com/avatar.png",
  });
});

test("authorizeCredentialsUser rejects missing credentials, missing hashes, and wrong passwords", async () => {
  assert.equal(
    await authorizeCredentialsUser(undefined, credentialClient(null)),
    null,
  );
  assert.equal(
    await authorizeCredentialsUser(
      { email: "person@example.com", password: "" },
      credentialClient(null),
    ),
    null,
  );
  assert.equal(
    await authorizeCredentialsUser(
      { email: "person@example.com", password: "secret" },
      credentialClient({
        id: "user_1",
        email: "person@example.com",
        name: null,
        image: null,
        passwordHash: null,
      }),
    ),
    null,
  );

  const passwordHash = await hashPassword("correct-password");
  assert.equal(
    await authorizeCredentialsUser(
      { email: "person@example.com", password: "wrong-password" },
      credentialClient({
        id: "user_1",
        email: "person@example.com",
        name: null,
        image: null,
        passwordHash,
      }),
    ),
    null,
  );
});
