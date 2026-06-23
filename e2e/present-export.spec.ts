import { promises as fs } from "node:fs";

import { expect, test } from "@playwright/test";

import { login } from "./helpers/auth";
import {
  E2E_PROFILE_FIXTURE,
  e2eProfileEnabled,
  profileDocPath,
  profileOwnerCredentials,
  profilePresentPath,
} from "./helpers/profile";

/**
 * Present + export E2E coverage (Epic #517, issue #520).
 *
 * Strengthens the present/export smoke beyond "the entry point is reachable":
 *   1. Authenticated present mode renders a NONBLANK slide containing the
 *      seeded title text via the in-editor `PresentButton` overlay.
 *   2. PUBLIC present mode renders the SAME seeded deck through the valid public
 *      share link (`/present/<slug>-<shareId>`).
 *   3. A real export download is triggered (PDF) and asserted to produce a file
 *      with a `.pdf` extension and nonzero bytes (via `waitForEvent('download')`).
 *
 * Pixel-level regression stays in `screenshot-regression.spec.ts`.
 *
 * Runs ONLY under the deterministic E2E profile (`E2E_PROFILE=1` +
 * `npm run db:seed:e2e`); skips cleanly otherwise so the fast gate stays green.
 */

const SLIDE_TEXT = E2E_PROFILE_FIXTURE.slideTitleText;

test.describe("present + export", () => {
  test.skip(
    !e2eProfileEnabled(),
    "Set E2E_PROFILE=1 and seed (npm run db:seed:e2e) to run present/export",
  );

  test("authenticated present mode renders the seeded slide text", async ({
    page,
  }) => {
    await login(page, profileOwnerCredentials());
    await page.goto(profileDocPath());

    const presentBtn = page.getByRole("button", { name: /^Present / });
    await expect(
      presentBtn,
      "present: Present button not found in editor toolbar",
    ).toBeVisible({ timeout: 20_000 });
    await presentBtn.click();

    const presentRegion = page.getByRole("region", { name: "Presentation" });
    await expect(
      presentRegion,
      "present: presentation overlay did not open",
    ).toBeVisible({ timeout: 20_000 });

    // Non-blank assertion: the seeded title text must render on the slide.
    await expect(
      presentRegion.getByText(SLIDE_TEXT, { exact: false }),
      "present: seeded slide text not rendered (blank slide)",
    ).toBeVisible({ timeout: 15_000 });
  });

  test("public present mode renders the seeded deck via the share link", async ({
    page,
  }) => {
    const response = await page.goto(profilePresentPath());
    expect(
      response?.status(),
      "present: public present link should resolve (200)",
    ).toBe(200);

    const region = page.getByRole("region", { name: /^Presentation/ });
    await expect(
      region,
      "present: public presentation region missing",
    ).toBeVisible({ timeout: 20_000 });

    await expect(
      page.getByText(SLIDE_TEXT, { exact: false }).first(),
      "present: seeded slide text missing on public present page",
    ).toBeVisible({ timeout: 15_000 });
  });

  test("exports a real PDF file with nonzero bytes", async ({ page }) => {
    await login(page, profileOwnerCredentials());
    await page.goto(profileDocPath());

    const exportBtn = page.getByRole("button", { name: "Export document" });
    await expect(
      exportBtn,
      "export: Export button not found in editor toolbar",
    ).toBeVisible({ timeout: 20_000 });
    await exportBtn.click();

    const menu = page.getByRole("menu", { name: "Export document" });
    await expect(menu, "export: export menu did not open").toBeVisible();

    // PDF is always available (no plan gating); it produces a real blob
    // download via an anchor click (src/lib/visual/export.ts).
    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await menu.getByRole("menuitem", { name: "PDF" }).click();

    const download = await downloadPromise;
    expect(
      download.suggestedFilename(),
      "export: downloaded file should be a .pdf",
    ).toMatch(/\.pdf$/);

    const filePath = await download.path();
    expect(filePath, "export: download produced no file path").toBeTruthy();
    const stat = await fs.stat(filePath!);
    expect(
      stat.size,
      "export: downloaded PDF should have nonzero bytes",
    ).toBeGreaterThan(0);
  });
});
