/* node:coverage ignore start -- Route pattern type is erased and only appears in source-map coverage. */
type RoutePattern = {
  path: string;
  match: "exact" | "prefix";
};
/* node:coverage ignore stop */

export const routeProtectionPolicy = {
  authenticatedHome: "/app",
  signIn: "/login",
  protectedRoutes: [{ path: "/app", match: "prefix" }],
  authPageRoutes: [
    { path: "/login", match: "exact" },
    { path: "/signup", match: "exact" },
  ],
  publicRoutes: [{ path: "/", match: "exact" }],
  proxy: {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
    excludedPrefixes: ["/api", "/_next/static", "/_next/image"],
    excludedPaths: ["/favicon.ico"],
  },
} as const;

function matchesPattern(pathname: string, pattern: RoutePattern): boolean {
  if (pattern.match === "exact") {
    return pathname === pattern.path;
  }

  return pathname.startsWith(pattern.path);
}

function matchesAny(
  pathname: string,
  patterns: readonly RoutePattern[],
): boolean {
  return patterns.some((pattern) => matchesPattern(pathname, pattern));
}

export function isProtectedRoute(pathname: string): boolean {
  return matchesAny(pathname, routeProtectionPolicy.protectedRoutes);
}

export function isAuthPageRoute(pathname: string): boolean {
  return matchesAny(pathname, routeProtectionPolicy.authPageRoutes);
}

export function isPublicRoute(pathname: string): boolean {
  return matchesAny(pathname, routeProtectionPolicy.publicRoutes);
}

export function authorizeRouteAccess(input: {
  isLoggedIn: boolean;
  nextUrl: URL;
}): boolean | Response {
  const { isLoggedIn, nextUrl } = input;

  if (isProtectedRoute(nextUrl.pathname)) {
    return isLoggedIn;
  }

  if (isAuthPageRoute(nextUrl.pathname) && isLoggedIn) {
    return Response.redirect(
      new URL(routeProtectionPolicy.authenticatedHome, nextUrl),
    );
  }

  return true;
}

export function isProxyRouteMatched(pathname: string): boolean {
  if (
    (routeProtectionPolicy.proxy.excludedPaths as readonly string[]).includes(
      pathname,
    )
  ) {
    return false;
  }

  return !routeProtectionPolicy.proxy.excludedPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );
}
