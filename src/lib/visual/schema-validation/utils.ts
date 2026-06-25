/** Shared helpers for visual schema validation modules. */

export class VisualValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisualValidationError";
  }
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function numberField(
  source: Record<string, unknown>,
  key: string,
  context: string,
  { positive = false }: { positive?: boolean } = {},
): number | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  if (!isFiniteNumber(value)) {
    throw new VisualValidationError(
      `${context}.${key} must be a finite number`,
    );
  }
  if (positive && value <= 0) {
    throw new VisualValidationError(`${context}.${key} must be greater than 0`);
  }
  return value;
}
