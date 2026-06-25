/**
 * MadeWithBadge — unobtrusive attribution badge for public share / embed /
 * present pages.
 *
 * Rendered as a fixed bottom-right anchor linking to the app's marketing /
 * signup page. Hidden on paid plans (removeWatermark entitlement) via the
 * server-side `shouldShowAttribution` helper; the component itself is a pure
 * presentational element that accepts a boolean prop.
 */

import Link from "next/link";

interface MadeWithBadgeProps {
  /** When false the badge renders nothing. Pass the result of
   * `shouldShowAttribution(ownerPlan)` from the server component. */
  show: boolean;
}

export function MadeWithBadge({ show }: MadeWithBadgeProps) {
  if (!show) return null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000";

  return (
    <Link
      href={`${appUrl}/sign-up`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Made with TextIQ — create your own document"
      className="
        fixed bottom-4 right-4 z-overlay
        flex items-center gap-1.5
        rounded-full
        border border-ds-border-subtle
        bg-ds-surface-base/90
        px-3 py-1.5
        text-xs font-medium
        text-ds-text-secondary
        shadow-sm
        backdrop-blur-sm
        transition-colors
        hover:bg-ds-surface-raised
        hover:text-ds-text-primary
        focus-visible:outline-none
        focus-visible:ring-2
        focus-visible:ring-ds-focus
      "
    >
      {/* Simple sparkle icon — inlined SVG, no extra dependency */}
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M6 1L7.12 4.38L10.5 5.5L7.12 6.62L6 10L4.88 6.62L1.5 5.5L4.88 4.38L6 1Z"
          fill="currentColor"
        />
      </svg>
      Made with TextIQ
    </Link>
  );
}
