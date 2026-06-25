import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import {
  E2E_PROFILE_FIXTURE,
  e2eProfileEnabled,
  profileDocPath,
  profileOwnerCredentials,
} from "./helpers/profile";

test.describe("deterministic profile document editor smoke", () => {
  test.skip(
    !e2eProfileEnabled(),
    "Set E2E_PROFILE=1 and seed (npm run db:seed:e2e) to run profile smoke",
  );

  test("opens the seeded document editor with deterministic content", async ({
    page,
  }) => {
    await login(page, profileOwnerCredentials());
    await page.goto(profileDocPath());

    const editor = page.getByLabel("Document body");
    await expect(editor).toBeVisible({ timeout: 20_000 });
    await expect(
      editor.getByText(E2E_PROFILE_FIXTURE.documentBodyText),
    ).toBeVisible();
  });
});
