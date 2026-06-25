/**
 * Shared parser for opt-in runtime flags.
 *
 * Missing values and unrecognised strings are false so feature switches fail
 * closed unless an operator explicitly opts in.
 */
export function parseBooleanFlag(value: string | null | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
