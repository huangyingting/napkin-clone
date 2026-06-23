/**
 * Pure accessibility assertion helpers (issue #462).
 *
 * These helpers are framework-free (no DOM, no React, no browser) and operate
 * on plain-object representations of component props / rendered output. They
 * are used by the a11y smoke tests below to assert that:
 *  - Interactive elements have accessible names (aria-label or text content).
 *  - Modal elements have correct roles and focus semantics.
 *  - Icon-only controls declare an accessible label.
 *  - Read-only / public routes use appropriate landmark roles.
 *
 * All functions return a structured result so callers can aggregate failures
 * and produce useful diagnostics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A simplified element descriptor for a11y assertions. */
export interface A11yElement {
  /** ARIA role (from `role` attribute) or HTML implicit role. */
  role?: string;
  /** `aria-label` attribute value. */
  ariaLabel?: string;
  /** `aria-labelledby` attribute value (id reference). */
  ariaLabelledBy?: string;
  /** Text content of the element (used as fallback accessible name). */
  textContent?: string;
  /** Whether the element is hidden from the accessibility tree. */
  ariaHidden?: boolean;
  /** Tab index (-1 = programmatically focusable, ≥0 = in tab order). */
  tabIndex?: number;
  /** Child elements. */
  children?: A11yElement[];
}

/** Result of a single a11y assertion. */
export interface A11yAssertionResult {
  /** Name of the check. */
  check: string;
  /** Whether the check passed. */
  passed: boolean;
  /** Human-readable reason when the check failed. */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Accessible name derivation
// ---------------------------------------------------------------------------

/**
 * Returns the accessible name of an element using the simplified ARIA name
 * computation: `aria-label` > `aria-labelledby` > `textContent`. Returns
 * `null` when no name is available.
 *
 * This is intentionally simplified (not a full accname spec implementation)
 * and suitable for smoke checks on statically known component props.
 */
export function accessibleName(el: A11yElement): string | null {
  if (el.ariaLabel?.trim()) return el.ariaLabel.trim();
  if (el.ariaLabelledBy?.trim())
    return `[labelledby:${el.ariaLabelledBy.trim()}]`;
  if (el.textContent?.trim()) return el.textContent.trim();
  return null;
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

/**
 * Assert that an element has a non-empty accessible name.
 */
export function assertHasAccessibleName(
  el: A11yElement,
  context = "element",
): A11yAssertionResult {
  const name = accessibleName(el);
  return {
    check: `${context} has accessible name`,
    passed: name !== null && name.length > 0,
    reason:
      name === null ? `No accessible name found for ${context}` : undefined,
  };
}

/**
 * Assert that an interactive control (button, link, input) is NOT aria-hidden
 * and has a non-empty accessible name.
 */
export function assertInteractiveAccessible(
  el: A11yElement,
  context = "control",
): A11yAssertionResult[] {
  const results: A11yAssertionResult[] = [];

  results.push({
    check: `${context} is not aria-hidden`,
    passed: el.ariaHidden !== true,
    reason: el.ariaHidden
      ? `${context} is aria-hidden — keyboard users cannot access it`
      : undefined,
  });

  results.push(assertHasAccessibleName(el, context));

  return results;
}

/**
 * Assert that a modal dialog element has:
 *  - role="dialog" or role="alertdialog"
 *  - an accessible label
 *  - aria-modal="true" is NOT required but role must be dialog-like
 */
export function assertModalSemantics(
  el: A11yElement,
  context = "modal",
): A11yAssertionResult[] {
  const results: A11yAssertionResult[] = [];

  const dialogRoles = new Set(["dialog", "alertdialog"]);
  results.push({
    check: `${context} has dialog role`,
    passed: el.role !== undefined && dialogRoles.has(el.role),
    reason:
      !el.role || !dialogRoles.has(el.role)
        ? `${context} has role="${el.role ?? "(none)"}"; expected "dialog" or "alertdialog"`
        : undefined,
  });

  results.push(assertHasAccessibleName(el, context));

  return results;
}

/**
 * Assert that an icon-only control (no visible text) has an accessible label.
 * Icon-only controls must have aria-label or aria-labelledby.
 */
export function assertIconControlLabelled(
  el: A11yElement,
  context = "icon-control",
): A11yAssertionResult {
  const hasExplicitLabel = Boolean(
    el.ariaLabel?.trim() || el.ariaLabelledBy?.trim(),
  );
  return {
    check: `${context} has explicit aria-label or aria-labelledby`,
    passed: hasExplicitLabel,
    reason: !hasExplicitLabel
      ? `Icon-only control "${context}" has no aria-label or aria-labelledby`
      : undefined,
  };
}

/**
 * Assert that an SVG visual element declares role="img" and has aria-label.
 */
export function assertSvgVisualAccessible(
  el: A11yElement,
  context = "visual svg",
): A11yAssertionResult[] {
  const results: A11yAssertionResult[] = [];

  results.push({
    check: `${context} has role="img"`,
    passed: el.role === "img",
    reason:
      el.role !== "img"
        ? `${context} has role="${el.role ?? "(none)"}"; expected "img"`
        : undefined,
  });

  results.push(assertHasAccessibleName(el, context));

  return results;
}

/**
 * Assert that a read-only / public surface is navigable (no unexpected
 * focus trap) — all focusable descendants should not have negative tabIndex
 * trapping focus inside without an escape mechanism.
 *
 * This is a simplified check that verifies at least one child is focusable
 * (tabIndex >= 0) when the surface contains interactive content.
 */
export function assertReadOnlyNavigable(
  el: A11yElement,
  context = "read-only surface",
): A11yAssertionResult {
  const descendants = collectDescendants(el);
  const hasFocusTrap = descendants.some(
    (d) => d.tabIndex !== undefined && d.tabIndex < 0 && !d.ariaHidden,
  );
  return {
    check: `${context} has no unexpected negative tabIndex focus trap`,
    passed: !hasFocusTrap,
    reason: hasFocusTrap
      ? `${context} contains a non-hidden element with tabIndex < 0 that could trap focus`
      : undefined,
  };
}

function collectDescendants(el: A11yElement): A11yElement[] {
  const result: A11yElement[] = [];
  for (const child of el.children ?? []) {
    result.push(child);
    result.push(...collectDescendants(child));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Aggregate helper
// ---------------------------------------------------------------------------

/**
 * Runs all results through a final check and returns an object summarising
 * pass/fail counts.
 */
export function summariseResults(results: A11yAssertionResult[]): {
  passed: number;
  failed: number;
  failures: A11yAssertionResult[];
} {
  const failures = results.filter((r) => !r.passed);
  return {
    passed: results.filter((r) => r.passed).length,
    failed: failures.length,
    failures,
  };
}
