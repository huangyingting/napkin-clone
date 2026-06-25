import assert from "node:assert/strict";
import test from "node:test";

import { createTranslator } from "@/lib/i18n";

import {
  buildAppShellViewModel,
  buildShellDisplayIdentity,
  buildShellPlanCreditSummary,
} from "./view-model";

test("app shell view model shapes logged-out navigation and utilities", () => {
  const viewModel = buildAppShellViewModel({
    account: null,
    billing: null,
    languageSwitcherEnabled: true,
    keyboardShortcutsEnabled: true,
    unlimitedCredits: false,
    t: createTranslator("en"),
  });

  assert.deepEqual(viewModel, {
    brandLabel: "TextIQ",
    auth: { isAuthenticated: false },
    displayIdentity: null,
    planCreditSummary: null,
    navItems: [
      {
        id: "login",
        href: "/login",
        label: "Log in",
        emphasis: "default",
      },
      {
        id: "signup",
        href: "/signup",
        label: "Sign up",
        emphasis: "primary",
      },
    ],
    enabledUtilities: {
      languageSwitcher: true,
      keyboardShortcuts: false,
      credits: false,
      userMenu: false,
    },
  });
});

test("app shell view model shapes authenticated plan, credits, nav, and utilities", () => {
  const viewModel = buildAppShellViewModel({
    account: { name: " Ada Lovelace ", email: "ada@example.com" },
    billing: { plan: "plus", creditBalance: 2500, creditsPerPeriod: 10_000 },
    languageSwitcherEnabled: false,
    keyboardShortcutsEnabled: true,
    unlimitedCredits: false,
    t: createTranslator("en"),
  });

  assert.deepEqual(viewModel.auth, { isAuthenticated: true });
  assert.deepEqual(viewModel.displayIdentity, {
    name: " Ada Lovelace ",
    email: "ada@example.com",
    displayName: "Ada Lovelace",
    avatarInitial: "A",
  });
  assert.deepEqual(viewModel.navItems, [
    {
      id: "documents",
      href: "/app",
      label: "Documents",
      emphasis: "default",
    },
    {
      id: "workspaces",
      href: "/app/workspaces",
      label: "Workspaces",
      emphasis: "default",
    },
    {
      id: "brands",
      href: "/app/brands",
      label: "Brands",
      emphasis: "default",
    },
  ]);
  assert.deepEqual(viewModel.planCreditSummary, {
    plan: "plus",
    planLabel: "Plus",
    balance: 2500,
    creditsPerPeriod: 10_000,
    unlimited: false,
    countLabel: "2,500",
    title: "2500 / 10000 credits remaining",
    href: "/app/settings/billing",
  });
  assert.deepEqual(viewModel.enabledUtilities, {
    languageSwitcher: false,
    keyboardShortcuts: true,
    credits: true,
    userMenu: true,
  });
});

test("app shell navigation labels are localized by the loader translator", () => {
  const viewModel = buildAppShellViewModel({
    account: { name: null, email: "usuario@example.com" },
    billing: { plan: "free", creditBalance: 500, creditsPerPeriod: 500 },
    languageSwitcherEnabled: true,
    keyboardShortcutsEnabled: true,
    unlimitedCredits: false,
    t: createTranslator("es"),
  });

  assert.equal(viewModel.brandLabel, "TextIQ");
  assert.deepEqual(
    viewModel.navItems.map((item) => item.label),
    ["Documentos", "Espacios de trabajo", "Marcas"],
  );
});

test("app shell credit summary supports unlimited-credit deployments", () => {
  const summary = buildShellPlanCreditSummary({
    billing: { plan: "pro", creditBalance: 123, creditsPerPeriod: 30_000 },
    unlimitedCredits: true,
  });

  assert.equal(summary.countLabel, "Unlimited");
  assert.equal(summary.title, "Unlimited credits");
  assert.equal(summary.unlimited, true);
});

test("display identity falls back to email when no name is available", () => {
  assert.deepEqual(
    buildShellDisplayIdentity({ name: "   ", email: "writer@example.com" }),
    {
      name: "   ",
      email: "writer@example.com",
      displayName: "writer@example.com",
      avatarInitial: "W",
    },
  );
});
