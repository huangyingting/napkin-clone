/** Extracts a trimmed, non-empty `error` string from an API JSON payload. */
export function apiErrorMessageFromPayload(
  payload: unknown,
  fallback: string,
): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === "string") {
      const trimmed = error.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return fallback;
}
