import { expect, type Locator, type Page } from "@playwright/test";

export async function waitForStableSlideStage(locator: Locator): Promise<void> {
  await locator.waitFor({ state: "visible", timeout: 10_000 });
}

export async function waitForSlideAutosave(page: Page): Promise<void> {
  await expect(page.getByText("All changes saved")).toBeVisible({
    timeout: 20_000,
  });
}
