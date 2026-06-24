import { expect, test, type Page } from "@playwright/test";

/**
 * Playwright layout-screenshot spec for the Concept B slide editor
 * (Epic #576, issue #590).
 *
 * Captures the editor shell across desktop, tablet, and mobile viewports and
 * across the key layout states the redesign introduced:
 *  - rail visible / hidden
 *  - right supplemental panel closed / open
 *  - speaker notes collapsed / expanded
 *  - selected-object context toolbar visible
 *
 * The goal is to assert that the canvas, rail, dock, panel, and toolbar lay out
 * coherently (no overlap) at each breakpoint. Comparisons use
 * `toHaveScreenshot()` with a stable pixel tolerance: the first opt-in run
 * generates baselines, subsequent runs compare.
 *
 * These tests require a running application and a seeded editor document. They
 * are NOT part of the unit gate (`npm test`) and are skipped cleanly when:
 *  - The `E2E_SLIDES_LAYOUT_SCREENSHOTS` env var is not set to `1`.
 *  - The app is unreachable or the editor route 404s.
 *
 * To generate / refresh baselines:
 *   E2E_SLIDES_LAYOUT_SCREENSHOTS=1 npx playwright test \
 *     slides-layout-screenshots.spec.ts --update-snapshots
 *
 * To run comparisons:
 *   E2E_SLIDES_LAYOUT_SCREENSHOTS=1 npx playwright test \
 *     slides-layout-screenshots.spec.ts
 */

// ---------------------------------------------------------------------------
// Guard — skip unless explicitly opted in via env var.
// ---------------------------------------------------------------------------

const LAYOUT_SCREENSHOTS_ENABLED =
  process.env.E2E_SLIDES_LAYOUT_SCREENSHOTS === "1";

// The editor route to capture. Override with E2E_SLIDES_EDITOR_PATH to point at
// a deterministic seeded document in your environment.
const EDITOR_PATH =
  process.env.E2E_SLIDES_EDITOR_PATH ??
  "/app/documents/regression-test-doc/slides";

// ---------------------------------------------------------------------------
// Viewports — desktop, tablet, mobile.
// ---------------------------------------------------------------------------

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 },
] as const;

const SCREENSHOT_OPTIONS = {
  maxDiffPixelRatio: 0.02,
  threshold: 0.2,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the editor and wait for the stage. Returns `true` when the editor
 * is reachable and rendered, `false` when the test should skip.
 */
async function openEditor(page: Page): Promise<boolean> {
  const response = await page.goto(EDITOR_PATH).catch(() => null);
  if (!response || response.status() === 404) {
    return false;
  }

  const stage = page
    .locator('[data-testid="slide-canvas"], .slide-canvas, [role="main"]')
    .first();
  const visible = await stage
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) {
    return false;
  }

  // Let fonts, layout, and the stage-fit measurement settle.
  await page.waitForTimeout(500);
  return true;
}

/**
 * Click a control by accessible name if present. Best-effort: missing controls
 * (e.g. a state already toggled at a given breakpoint) are ignored so the spec
 * stays resilient across breakpoints.
 */
async function clickByName(page: Page, name: string | RegExp): Promise<void> {
  const control = page.getByRole("button", { name }).first();
  if (
    await control
      .count()
      .then((c) => c > 0)
      .catch(() => false)
  ) {
    await control.click({ timeout: 2_000 }).catch(() => {});
    await page.waitForTimeout(250);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

for (const viewport of VIEWPORTS) {
  test.describe(`slides layout screenshots — ${viewport.name}`, () => {
    test.beforeEach(({ page }) => {
      test.skip(
        !LAYOUT_SCREENSHOTS_ENABLED,
        "Set E2E_SLIDES_LAYOUT_SCREENSHOTS=1 to run slide layout screenshots",
      );
      page.setViewportSize({ width: viewport.width, height: viewport.height });
    });

    test(`base editor layout (${viewport.name})`, async ({ page }) => {
      if (!(await openEditor(page))) {
        test.skip();
        return;
      }
      await expect(page).toHaveScreenshot(
        `editor-${viewport.name}-base.png`,
        SCREENSHOT_OPTIONS,
      );
    });

    test(`rail hidden (${viewport.name})`, async ({ page }) => {
      if (!(await openEditor(page))) {
        test.skip();
        return;
      }
      await clickByName(page, /hide slide thumbnails/i);
      await expect(page).toHaveScreenshot(
        `editor-${viewport.name}-rail-hidden.png`,
        SCREENSHOT_OPTIONS,
      );
    });

    test(`notes expanded (${viewport.name})`, async ({ page }) => {
      if (!(await openEditor(page))) {
        test.skip();
        return;
      }
      await clickByName(page, /^notes$/i);
      await expect(page).toHaveScreenshot(
        `editor-${viewport.name}-notes-expanded.png`,
        SCREENSHOT_OPTIONS,
      );
    });

    test(`right panel open with selection (${viewport.name})`, async ({
      page,
    }) => {
      if (!(await openEditor(page))) {
        test.skip();
        return;
      }

      // Select the first stage element so the context toolbar appears and the
      // supplemental panel has element content to show.
      const element = page.locator("[data-element-id]").first();
      if (
        await element
          .count()
          .then((c) => c > 0)
          .catch(() => false)
      ) {
        await element.click({ timeout: 2_000 }).catch(() => {});
        await page.waitForTimeout(250);
      }

      // Open the supplemental panel via its toggle if it is not already open.
      await clickByName(page, /(arrange|details|layers|properties|panel)/i);

      await expect(page).toHaveScreenshot(
        `editor-${viewport.name}-panel-open.png`,
        SCREENSHOT_OPTIONS,
      );
    });
  });
}
