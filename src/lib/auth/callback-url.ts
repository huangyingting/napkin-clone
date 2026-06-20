/**
 * Validates a post-authentication redirect ("callbackUrl") target.
 *
 * Only same-origin, root-relative paths are allowed. Anything that could send
 * the user to a different origin — absolute URLs, protocol-relative URLs
 * (`//evil.com`), backslash tricks (`/\evil.com`) that browsers normalise to a
 * host, or non-`http` schemes (`javascript:`) — falls back to the app default.
 *
 * This is the security-critical piece guarding against open-redirect attacks,
 * so it is conservative by design: when in doubt, return the safe default.
 */
export const DEFAULT_CALLBACK_URL = "/";

export function safeCallbackUrl(raw: unknown): string {
  if (typeof raw !== "string") {
    return DEFAULT_CALLBACK_URL;
  }

  const value = raw.trim();

  // Must be a non-empty, root-relative path.
  if (value.length === 0 || value[0] !== "/") {
    return DEFAULT_CALLBACK_URL;
  }

  // Reject protocol-relative ("//host") and backslash variants ("/\host",
  // "/\\host") that browsers normalise into "//host" (a different origin).
  if (value[1] === "/" || value[1] === "\\") {
    return DEFAULT_CALLBACK_URL;
  }

  // Backslashes anywhere are treated as forward slashes by browsers, which can
  // smuggle an alternate origin past naive checks. Reject outright.
  if (value.includes("\\")) {
    return DEFAULT_CALLBACK_URL;
  }

  // Reject ASCII control characters (tabs/newlines/etc.) used to bypass parsing.
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return DEFAULT_CALLBACK_URL;
  }

  // Final guard: resolve against an opaque base origin and confirm the result
  // stays on that origin. Anything that parses to a different origin (or fails
  // to parse) falls back to the default.
  try {
    const base = "http://localhost";
    const resolved = new URL(value, base);
    if (resolved.origin !== base) {
      return DEFAULT_CALLBACK_URL;
    }
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return DEFAULT_CALLBACK_URL;
  }
}
