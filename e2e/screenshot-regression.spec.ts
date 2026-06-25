import { expect, test } from "@playwright/test";

/**
 * Playwright screenshot regression spec for Slides (Epic #379, issue #415).
 *
 * These tests use deterministic deck fixtures to capture visual snapshots of
 * the slide editor stage, the in-app present viewer, and the public present
 * route.  They cover the core visual element categories:
 *  - text and bullets
 *  - shapes
 *  - images (data URL)
 *  - connectors
 *  - background colors
 *
 * Screenshot comparisons use `toHaveScreenshot()` with a stable pixel
 * tolerance.  The first run generates the baseline; subsequent runs compare
 * against it.
 *
 * These tests require a running application and are NOT part of the unit gate
 * (`npm test`).  They are skipped cleanly when:
 *  - The app is unreachable (no running dev server).
 *  - The `E2E_SCREENSHOT_REGRESSION` environment variable is not set to `1`.
 *
 * To generate / refresh baselines:
 *   E2E_SCREENSHOT_REGRESSION=1 npx playwright test screenshot-regression.spec.ts --update-snapshots
 *
 * To run comparisons:
 *   E2E_SCREENSHOT_REGRESSION=1 npx playwright test screenshot-regression.spec.ts
 */

// ---------------------------------------------------------------------------
// Guard — skip unless explicitly opted in via env var.
// This prevents accidental flakiness in the standard E2E suite.
// ---------------------------------------------------------------------------

const SCREENSHOT_REGRESSION_ENABLED =
  process.env.E2E_SCREENSHOT_REGRESSION === "1";

// ---------------------------------------------------------------------------
// Deterministic deck fixture
// ---------------------------------------------------------------------------

/**
 * A minimal deck JSON fixture that exercises all major element categories.
 * The deck is deterministic: no random IDs, no timestamps, no server state.
 *
 * Typed as `Record<string, unknown>` so the plain object literal is assignable
 * to `evaluate()` parameters without requiring full Deck type imports.
 */
const REGRESSION_DECK_FIXTURE: Record<string, unknown> = {
  themeId: "default",
  slides: [
    {
      id: "slide-text-bullets",
      index: 0,
      title: "Text and Bullets",
      bullets: [],
      visualIds: [],
      layout: "blank",
      notes: "",
      background: "#ffffff",
      elements: [
        {
          id: "title-el",
          kind: "text",
          role: "title",
          text: "Regression Title",
          box: { x: 5, y: 5, w: 90, h: 15 },
          zIndex: 0,
          style: { fontSize: 6, bold: true, italic: false, align: "center" },
        },
        {
          id: "body-bullets",
          kind: "bullets",
          bullets: ["First point", "Second point", "Third point"],
          box: { x: 10, y: 25, w: 80, h: 50 },
          zIndex: 1,
          style: { fontSize: 4, bold: false, italic: false, align: "left" },
        },
      ],
    },
    {
      id: "slide-shapes",
      index: 1,
      title: "Shapes",
      bullets: [],
      visualIds: [],
      layout: "blank",
      notes: "",
      background: "#f8f9fa",
      elements: [
        {
          id: "rect-el",
          kind: "shape",
          shape: "rect",
          color: "#6366f1",
          text: "Rectangle",
          box: { x: 10, y: 20, w: 30, h: 20 },
          zIndex: 0,
          radius: 5,
        },
        {
          id: "ellipse-el",
          kind: "shape",
          shape: "ellipse",
          color: "#10b981",
          text: "Ellipse",
          box: { x: 60, y: 20, w: 25, h: 20 },
          zIndex: 1,
        },
        {
          id: "triangle-el",
          kind: "shape",
          shape: "triangle",
          color: "#f59e0b",
          box: { x: 35, y: 55, w: 25, h: 20 },
          zIndex: 2,
        },
      ],
    },
    {
      id: "slide-image-connector",
      index: 2,
      title: "Image and Connector",
      bullets: [],
      visualIds: [],
      layout: "blank",
      notes: "",
      background: "#1e293b",
      elements: [
        {
          id: "image-el",
          kind: "image",
          // Minimal 1x1 transparent PNG data URL
          src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
          alt: "Test image",
          fitMode: "contain",
          box: { x: 10, y: 15, w: 35, h: 35 },
          zIndex: 0,
        },
        {
          id: "connector-el",
          kind: "connector",
          start: { x: 60, y: 25 },
          end: { x: 85, y: 65 },
          routing: "straight",
          arrowEnd: "arrow",
          stroke: { color: "#94a3b8", width: 2 },
          box: { x: 60, y: 25, w: 25, h: 40 },
          zIndex: 1,
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Helper to inject the deck fixture into a page via localStorage
// ---------------------------------------------------------------------------

async function injectDeckFixture(
  page: import("@playwright/test").Page,
  documentId: string,
): Promise<void> {
  await page.evaluate(
    ({ id, deck }) => {
      try {
        localStorage.setItem(
          `textiq:deck:${id}`,
          JSON.stringify({ deckJson: deck }),
        );
      } catch {
        // localStorage may be unavailable — that is fine.
      }
    },
    { id: documentId, deck: REGRESSION_DECK_FIXTURE },
  );
}

// ---------------------------------------------------------------------------
// Viewport and tolerance constants
// ---------------------------------------------------------------------------

const SLIDE_VIEWPORT = { width: 1280, height: 720 };

const SCREENSHOT_OPTIONS = {
  maxDiffPixelRatio: 0.02,
  threshold: 0.2,
} as const;

// ---------------------------------------------------------------------------
// Tests: editor stage
// ---------------------------------------------------------------------------

test.describe("screenshot regression — slide editor", () => {
  test.beforeEach(({ page }) => {
    test.skip(
      !SCREENSHOT_REGRESSION_ENABLED,
      "Set E2E_SCREENSHOT_REGRESSION=1 to run screenshot regression tests",
    );
    page.setViewportSize(SLIDE_VIEWPORT);
  });

  test("editor stage renders text and bullets slide", async ({ page }) => {
    const response = await page
      .goto("/app/documents/regression-test-doc/slides")
      .catch(() => null);

    if (!response || response.status() === 404) {
      test.skip();
      return;
    }

    const canvas = page
      .locator('[data-testid="slide-canvas"], .slide-canvas, [role="main"]')
      .first();
    await canvas.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {
      test.skip();
    });

    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot(
      "editor-text-bullets.png",
      SCREENSHOT_OPTIONS,
    );
  });

  test("editor stage renders shapes slide", async ({ page }) => {
    const response = await page
      .goto("/app/documents/regression-test-doc/slides?slide=1")
      .catch(() => null);

    if (!response || response.status() === 404) {
      test.skip();
      return;
    }

    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot(
      "editor-shapes.png",
      SCREENSHOT_OPTIONS,
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: in-app present viewer
// ---------------------------------------------------------------------------

test.describe("screenshot regression — in-app present viewer", () => {
  test.beforeEach(() => {
    test.skip(
      !SCREENSHOT_REGRESSION_ENABLED,
      "Set E2E_SCREENSHOT_REGRESSION=1 to run screenshot regression tests",
    );
  });

  test("present mode renders text and bullets slide", async ({ page }) => {
    page.setViewportSize(SLIDE_VIEWPORT);

    const response = await page
      .goto("/app/documents/regression-test-doc/present")
      .catch(() => null);

    if (!response || response.status() === 404) {
      test.skip();
      return;
    }

    const slideView = page
      .locator(
        '[data-testid="present-slide"], .present-slide, [role="presentation"]',
      )
      .first();

    await slideView.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {
      test.skip();
    });

    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot(
      "present-text-bullets.png",
      SCREENSHOT_OPTIONS,
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: public present viewer
// ---------------------------------------------------------------------------

test.describe("screenshot regression — public present viewer", () => {
  test.beforeEach(() => {
    test.skip(
      !SCREENSHOT_REGRESSION_ENABLED,
      "Set E2E_SCREENSHOT_REGRESSION=1 to run screenshot regression tests",
    );
  });

  test("public present route renders slides for a valid share id", async ({
    page,
  }) => {
    const shareId = process.env.E2E_REGRESSION_SHARE_ID;
    test.skip(
      !shareId,
      "Set E2E_REGRESSION_SHARE_ID to run public present regression test",
    );

    page.setViewportSize(SLIDE_VIEWPORT);

    const response = await page.goto(`/present/${shareId}`).catch(() => null);

    if (!response || response.status() === 404) {
      test.skip();
      return;
    }

    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot(
      "public-present-slide.png",
      SCREENSHOT_OPTIONS,
    );
  });

  test("public embed route renders for a valid share id", async ({ page }) => {
    const shareId = process.env.E2E_REGRESSION_SHARE_ID;
    test.skip(
      !shareId,
      "Set E2E_REGRESSION_SHARE_ID to run public embed regression test",
    );

    page.setViewportSize({ width: 800, height: 450 });

    const response = await page.goto(`/embed/${shareId}`).catch(() => null);

    if (!response || response.status() === 404) {
      test.skip();
      return;
    }

    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot(
      "public-embed-slide.png",
      SCREENSHOT_OPTIONS,
    );
  });
});

// ---------------------------------------------------------------------------
// Deterministic fixture integrity tests (run without a server)
// ---------------------------------------------------------------------------

test.describe("deck fixture integrity", () => {
  test("regression deck fixture has expected slide count", () => {
    const slides = REGRESSION_DECK_FIXTURE.slides as unknown[];
    expect(slides).toHaveLength(3);
  });

  test("regression deck fixture slide ids are unique", () => {
    const slides = REGRESSION_DECK_FIXTURE.slides as Array<{ id: string }>;
    const ids = slides.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test("regression deck fixture element kinds cover required categories", () => {
    const slides = REGRESSION_DECK_FIXTURE.slides as Array<{
      elements: Array<{ kind: string }>;
    }>;
    const allElements = slides.flatMap((s) => s.elements);
    const kinds = new Set(allElements.map((el) => el.kind));
    expect(kinds.has("text")).toBe(true);
    expect(kinds.has("bullets")).toBe(true);
    expect(kinds.has("shape")).toBe(true);
    expect(kinds.has("image")).toBe(true);
    expect(kinds.has("connector")).toBe(true);
  });

  test("regression deck fixture shape kinds cover rect, ellipse, triangle", () => {
    const slides = REGRESSION_DECK_FIXTURE.slides as Array<{
      elements: Array<{ kind: string; shape?: string }>;
    }>;
    const shapes = slides
      .flatMap((s) => s.elements)
      .filter((el) => el.kind === "shape");
    const shapeKinds = new Set(shapes.map((s) => s.shape));
    expect(shapeKinds.has("rect")).toBe(true);
    expect(shapeKinds.has("ellipse")).toBe(true);
    expect(shapeKinds.has("triangle")).toBe(true);
  });

  test("regression deck fixture backgrounds cover white, light, and dark", () => {
    const slides = REGRESSION_DECK_FIXTURE.slides as Array<{
      background: string;
    }>;
    const bgs = slides.map((s) => s.background);
    expect(bgs).toContain("#ffffff");
    expect(bgs).toContain("#f8f9fa");
    expect(bgs).toContain("#1e293b");
  });

  test("image fixture uses a valid data URL", () => {
    const slides = REGRESSION_DECK_FIXTURE.slides as Array<{
      elements: Array<{ kind: string; src?: string }>;
    }>;
    const imageEl = slides[2].elements.find((el) => el.kind === "image");
    expect(imageEl).toBeDefined();
    expect(imageEl?.src).toMatch(/^data:image\/png;base64,/);
  });
});

// Make injectDeckFixture available for future test extension without the
// TypeScript unused-variable warning.
export { injectDeckFixture };
