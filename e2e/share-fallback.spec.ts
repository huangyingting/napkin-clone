import { expect, test } from "@playwright/test";

/**
 * Share / presentation fallback coverage (issue #107, building on #98).
 *
 * Unknown, non-shared, expired, regenerated, or deleted share links must resolve
 * to a safe "not found" fallback rather than leaking document content or
 * erroring out. Both the read-only `/share/[shareId]` view and the
 * `/present/[shareId]` presentation route call `notFound()` for links that fail
 * the centralized share-access decision.
 *
 * A random, non-existent share id is guaranteed to be unknown, so these specs
 * are deterministic without any seeded data.
 */
const UNKNOWN_SHARE_ID = "playwright-nonexistent-share-id";

test.describe("share/present fallback", () => {
  test("unknown /share link renders the not-found fallback", async ({
    page,
  }) => {
    const response = await page.goto(`/share/${UNKNOWN_SHARE_ID}`);

    // Next.js notFound() serves the 404 page.
    expect(response?.status()).toBe(404);
    await expect(page.getByText(/not found|404/i).first()).toBeVisible();
  });

  test("unknown /present link renders the not-found fallback", async ({
    page,
  }) => {
    const response = await page.goto(`/present/${UNKNOWN_SHARE_ID}`);

    expect(response?.status()).toBe(404);
    await expect(page.getByText(/not found|404/i).first()).toBeVisible();
  });

  test("unknown /embed link renders the not-found fallback", async ({
    page,
  }) => {
    const response = await page.goto(`/embed/${UNKNOWN_SHARE_ID}`);

    expect(response?.status()).toBe(404);
  });
});
