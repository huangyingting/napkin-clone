/**
 * Per-attempt abort deadline for Azure OpenAI calls (#136).
 *
 * Each call to `azureChatComplete` is given its own `AbortController` so a
 * hung model cannot hold the request open indefinitely. The timer is always
 * cleared on settle (success or failure) so no dangling timeout remains on
 * the event loop — mirrors the `withTimeout` pattern in
 * `src/lib/import/timeout.ts`.
 */

/** Per-attempt deadline for the Azure OpenAI generation call. */
export const GENERATE_TIMEOUT_MS = 45_000;

/** Thrown when a wrapped operation does not settle within its deadline. */
export class GenerateTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`AI generation timed out after ${timeoutMs}ms.`);
    this.name = "GenerateTimeoutError";
  }
}

/**
 * Runs `factory(signal)` but rejects with {@link GenerateTimeoutError} if it
 * has not settled within `timeoutMs`. The `AbortController` is aborted and the
 * timer cleared on settle so the event loop is never left pinned.
 */
export function withAbortDeadline<T>(
  factory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = GENERATE_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      reject(new GenerateTimeoutError(timeoutMs));
    }, timeoutMs);

    factory(controller.signal).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
