import assert from "node:assert/strict";
import test from "node:test";

import { assertViewModelSerializable } from "@/lib/view-models/serializable";

import { buildSettingsAccountViewModel } from "./view-model";

test("settings account view model serializes account form state", () => {
  const viewModel = buildSettingsAccountViewModel({
    googleConfigured: true,
    user: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      image: "https://lh3.googleusercontent.com/avatar",
      passwordHash: "hash",
      emailVerified: new Date("2026-02-03T04:05:06.000Z"),
    },
  });

  assert.deepEqual(viewModel.profile, {
    initialName: "Ada Lovelace",
    email: "ada@example.com",
  });
  assert.equal(viewModel.emailVerification.isVerified, true);
  assert.equal(viewModel.password.heading, "Change password");
  assert.deepEqual(
    viewModel.connectedAccounts.map((account) => account.connected),
    [true, true],
  );
  assertViewModelSerializable(viewModel);
});

test("settings account view model handles passwordless unverified accounts", () => {
  const viewModel = buildSettingsAccountViewModel({
    googleConfigured: false,
    user: {
      name: null,
      email: "writer@example.com",
      image: null,
      passwordHash: null,
      emailVerified: null,
    },
  });

  assert.equal(viewModel.profile.initialName, "");
  assert.equal(viewModel.emailVerification.badgeLabel, "Unverified");
  assert.equal(viewModel.password.heading, "Set a password");
  assert.deepEqual(
    viewModel.connectedAccounts.filter((account) => account.available),
    [
      {
        provider: "password",
        label: "Email & password",
        connected: false,
        available: true,
      },
    ],
  );
  assertViewModelSerializable(viewModel);
});
