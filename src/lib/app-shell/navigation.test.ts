import assert from "node:assert/strict";
import test from "node:test";

import { createTranslator } from "@/lib/i18n";

import { resolveShellNavItems, SHELL_NAV_REGISTRY } from "./navigation";

test("shell navigation registry defines each item once", () => {
  const ids = SHELL_NAV_REGISTRY.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, [
    "documents",
    "workspaces",
    "brands",
    "login",
    "signup",
  ]);
});

test("authenticated shell navigation comes from the shared registry", () => {
  const items = resolveShellNavItems(true, createTranslator("en"));

  assert.deepEqual(
    items.map((item) => [item.id, item.href, item.label]),
    [
      ["documents", "/app", "Documents"],
      ["workspaces", "/app/workspaces", "Workspaces"],
      ["brands", "/app/brands", "Brands"],
    ],
  );
});

test("anonymous shell navigation keeps login and signup links together", () => {
  const items = resolveShellNavItems(false, createTranslator("en"));

  assert.deepEqual(items, [
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
  ]);
});
