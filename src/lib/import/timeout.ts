/**
 * Bounded-time execution for the document import parsers (#96, criterion 3).
 *
 * Heavy parsers (mammoth, jszip, pdf-parse) run server-side on attacker-
 * supplied bytes and can be coerced into pathological CPU/IO time. Wrapping each
 * parse in {@link withTimeout} guarantees the route rejects with a clear error
 * instead of pinning the Node.js runtime indefinitely.
 *
 * The helper is pure with respect to its inputs (it takes a promise factory and
 * a clock-free timeout) so it can be unit-tested deterministically.
 */

/** Default per-parse timeout in milliseconds. */
export const DEFAULT_PARSE_TIMEOUT_MS = 15_000;

/** Thrown when a wrapped operation does not settle within its timeout. */
export class ParseTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Parsing timed out after ${timeoutMs}ms.`);
    this.name = "ParseTimeoutError";
  }
}

/**
 * Runs `factory()` but rejects with {@link ParseTimeoutError} if it has not
 * settled within `timeoutMs`. The timer is always cleared on settle so a fast
 * resolution never leaves the event loop pinned by a dangling timeout.
 */
export function withTimeout<T>(
  factory: () => Promise<T>,
  timeoutMs: number = DEFAULT_PARSE_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new ParseTimeoutError(timeoutMs));
    }, timeoutMs);

    factory().then(
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
