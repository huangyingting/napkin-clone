/**
 * Exhaustiveness helper for discriminated-union switches.
 *
 * Call in a `default` branch that should never be reached:
 *
 * ```ts
 * switch (element.kind) {
 *   case "text": ...
 *   // ... all cases ...
 *   default: return assertNever(element);
 * }
 * ```
 *
 * TypeScript widens the argument to `never` only when every union member has a
 * matching `case` branch. If a new variant is added to the union and no `case`
 * is added to the switch, the compiler emits an error at the `assertNever` call
 * site. At runtime the function throws so a missing case is caught in tests.
 */
export function assertNever(x: never): never {
  throw new Error(`assertNever: unexpected value ${JSON.stringify(x)}`);
}
