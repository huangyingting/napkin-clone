export const HEADER_SUPPRESSED_PATH_PREFIXES = ["/embed", "/present"] as const;

export function shouldRenderAppHeader(
  pathname: string | null | undefined,
): boolean {
  return !HEADER_SUPPRESSED_PATH_PREFIXES.some((prefix) =>
    pathname?.startsWith(prefix),
  );
}
