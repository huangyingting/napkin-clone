export const HEADER_SUPPRESSED_PATH_PREFIXES = ["/embed", "/present"] as const;

const SLIDE_EDITOR_ROUTE_PATTERN = /^\/app\/documents\/[^/]+\/slides(?:\/|$)/;

export function shouldRenderAppHeader(
  pathname: string | null | undefined,
): boolean {
  if (pathname && SLIDE_EDITOR_ROUTE_PATTERN.test(pathname)) {
    return false;
  }
  return !HEADER_SUPPRESSED_PATH_PREFIXES.some((prefix) =>
    pathname?.startsWith(prefix),
  );
}
