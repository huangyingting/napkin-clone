import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isProxyRouteMatched,
  routeProtectionPolicy,
} from "@/lib/auth/route-protection-policy";

import { config } from "./proxy";

function proxyMatcherAllows(pathname: string): boolean {
  const [matcher] = config.matcher;
  const regex = new RegExp(`^${matcher}$`);
  return regex.test(pathname);
}

test("proxy matcher is explicit and sourced from the shared route policy", () => {
  assert.deepEqual(config.matcher, routeProtectionPolicy.proxy.matcher);
  assert.deepEqual(config.matcher, [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ]);
});

test("proxy matcher excludes API, Next static/image, and favicon routes", () => {
  for (const path of [
    "/api/auth/session",
    "/apiary",
    "/_next/static/chunk.js",
    "/_next/image",
    "/favicon.ico",
  ]) {
    assert.equal(proxyMatcherAllows(path), false, path);
    assert.equal(isProxyRouteMatched(path), false, path);
  }
});

test("proxy matcher includes public, auth, and protected page routes", () => {
  for (const path of ["/", "/login", "/signup", "/app", "/app/settings"]) {
    assert.equal(proxyMatcherAllows(path), true, path);
    assert.equal(isProxyRouteMatched(path), true, path);
  }
});
