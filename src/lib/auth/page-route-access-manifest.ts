import { routeProtectionPolicy } from "@/lib/auth/route-protection-policy";

export type PageAccessClassification =
  | "public"
  | "auth-page"
  | "authenticated-session"
  | "share-policy"
  | "public-asset"
  | "api-excluded";

export type PageRouteAccessEntry = {
  pattern: string;
  match: "exact" | "prefix";
  classification: PageAccessClassification;
  proxy: "matched" | "excluded";
  owner: string;
  notes: string;
};

export const pageRouteAccessManifest = [
  {
    pattern: "/",
    match: "exact",
    classification: "public",
    proxy: "matched",
    owner: "Growth",
    notes: "Marketing/home route.",
  },
  {
    pattern: "/visuals",
    match: "exact",
    classification: "public",
    proxy: "matched",
    owner: "Growth",
    notes: "Public visual examples route.",
  },
  {
    pattern: "/login",
    match: "exact",
    classification: "auth-page",
    proxy: "matched",
    owner: "Platform/Auth",
    notes: "Signed-in users redirect to /app.",
  },
  {
    pattern: "/signup",
    match: "exact",
    classification: "auth-page",
    proxy: "matched",
    owner: "Platform/Auth",
    notes: "Signed-in users redirect to /app.",
  },
  {
    pattern: "/forgot-password",
    match: "exact",
    classification: "auth-page",
    proxy: "matched",
    owner: "Platform/Auth",
    notes: "Public password-reset request form.",
  },
  {
    pattern: "/reset-password",
    match: "exact",
    classification: "auth-page",
    proxy: "matched",
    owner: "Platform/Auth",
    notes: "Token-gated password reset form.",
  },
  {
    pattern: "/verify-email",
    match: "prefix",
    classification: "auth-page",
    proxy: "matched",
    owner: "Platform/Auth",
    notes: "Token-gated email verification route.",
  },
  {
    pattern: "/signout",
    match: "exact",
    classification: "auth-page",
    proxy: "matched",
    owner: "Platform/Auth",
    notes: "Route handler signs out and redirects.",
  },
  {
    pattern: "/share",
    match: "prefix",
    classification: "share-policy",
    proxy: "matched",
    owner: "Presentation",
    notes: "Public share links are resolved by share policy.",
  },
  {
    pattern: "/embed",
    match: "prefix",
    classification: "share-policy",
    proxy: "matched",
    owner: "Presentation",
    notes: "Public embed links are resolved by share policy.",
  },
  {
    pattern: "/present",
    match: "prefix",
    classification: "share-policy",
    proxy: "matched",
    owner: "Presentation",
    notes: "Public presentation links are resolved by share policy.",
  },
  {
    pattern: routeProtectionPolicy.authenticatedHome,
    match: "prefix",
    classification: "authenticated-session",
    proxy: "matched",
    owner: "Product",
    notes: "Application shell and document/workspace/settings routes.",
  },
  {
    pattern: "/api",
    match: "prefix",
    classification: "api-excluded",
    proxy: "excluded",
    owner: "Platform",
    notes: "API routes are governed by the API route security matrix.",
  },
  {
    pattern: "/_next/static",
    match: "prefix",
    classification: "public-asset",
    proxy: "excluded",
    owner: "Platform",
    notes: "Next static build assets.",
  },
  {
    pattern: "/_next/image",
    match: "prefix",
    classification: "public-asset",
    proxy: "excluded",
    owner: "Platform",
    notes: "Next image optimizer route.",
  },
  {
    pattern: "/favicon.ico",
    match: "exact",
    classification: "public-asset",
    proxy: "excluded",
    owner: "Platform",
    notes: "Browser favicon.",
  },
] as const satisfies readonly PageRouteAccessEntry[];

export function matchesPageAccessEntry(
  pathname: string,
  entry: PageRouteAccessEntry,
): boolean {
  return entry.match === "exact"
    ? pathname === entry.pattern
    : pathname === entry.pattern || pathname.startsWith(`${entry.pattern}/`);
}

export function classifyPageRoute(
  pathname: string,
): PageRouteAccessEntry | null {
  return (
    pageRouteAccessManifest.find((entry) =>
      matchesPageAccessEntry(pathname, entry),
    ) ?? null
  );
}
