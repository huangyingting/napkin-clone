"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { FloatingSurface } from "./floating-surface";
import { Swatch, type SwatchSize } from "./swatch";
import { cx, FOCUS_RING, RADIUS } from "./tokens";

/**
 * A neutral, broadly-useful default palette spanning the hue wheel plus a
 * grayscale ramp. Callers can override via {@link ColorPickerProps.presets}
 * (e.g. to surface the active visual's theme palette first).
 */
export const DEFAULT_SWATCH_PRESETS: readonly string[] = [
  "#ffffff",
  "#f1f5f9",
  "#cbd5e1",
  "#64748b",
  "#1e293b",
  "#000000",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#78716c",
];

// Gap (px) between the trigger swatch and the picker popover.
const PICKER_GAP = 6;
const EDGE_INSET = 8;
const PICKER_WIDTH = 208;

/** Coerces an arbitrary CSS color to a `#rrggbb` value for the native input. */
function toHex(value: string | undefined, fallback: string): string {
  if (value && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toLowerCase();
  }
  return fallback;
}

export type ColorPickerProps = {
  /** Current color value (any CSS color; coerced to hex for the custom input). */
  color: string;
  onChange: (hex: string) => void;
  /** Accessible name for the trigger (e.g. "Background color"). */
  "aria-label": string;
  presets?: readonly string[];
  size?: SwatchSize;
  /** Fallback hex used when `color` isn't a `#rrggbb` value. */
  fallback?: string;
  /**
   * Optional icon rendered inside the trigger so adjacent color controls stay
   * distinguishable at a glance (e.g. a text-color "A" vs. a highlighter). When
   * set, the trigger shows the icon over a neutral tile with a thin underline
   * bar of the current color, instead of a fully color-filled swatch.
   */
  icon?: ReactNode;
  /** Whether the trigger reads as active/selected (a value is applied). */
  active?: boolean;
  /**
   * When provided, the popover shows a "reset" action that clears the style.
   * Used for the "Default / None" affordance on text color & highlight.
   */
  onReset?: () => void;
  /** Label for the reset action. Defaults to "Default". */
  resetLabel?: string;
  /**
   * Keep the host editor's text selection intact while interacting with the
   * picker: skip the auto-focus-into-grid on open and `preventDefault` the
   * preset/reset pointer-downs so focus never leaves the editor (the toolbar and
   * its anchored selection stay alive). Used by the floating text toolbar.
   */
  preserveSelection?: boolean;
};

/**
 * A swatch-triggered color picker popover replacing the bare
 * `<input type=color>` rows. The trigger is a {@link Swatch} of the current
 * color; activating it opens a portal popover ({@link FloatingSurface}) with a
 * preset palette grid plus a custom color input + hex field. Token-driven,
 * keyboard-accessible (roving focus into the grid on open, Escape/click-away to
 * close via the surface), and reduced-motion-aware.
 *
 * The popover content carries `data-ds-floating` so an outer surface's
 * click-away logic can recognise it as a transient DS layer and not dismiss
 * itself when the user reaches into the picker.
 */
export function ColorPicker({
  color,
  onChange,
  "aria-label": ariaLabel,
  presets = DEFAULT_SWATCH_PRESETS,
  size = "md",
  fallback = "#000000",
  icon,
  active,
  onReset,
  resetLabel = "Default",
  preserveSelection = false,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const firstPresetRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: -1000,
    left: -1000,
  });
  const labelId = useId();
  const hex = toHex(color, fallback);
  const hasColor = color.trim() !== "";

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    let left = rect.left;
    left = Math.max(
      EDGE_INSET,
      Math.min(left, window.innerWidth - PICKER_WIDTH - EDGE_INSET),
    );
    const top = rect.bottom + PICKER_GAP;
    setCoords({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  // Move focus into the grid when the popover opens so it's keyboard-operable,
  // and restore focus to the trigger when it closes (focus management). Both are
  // skipped in `preserveSelection` mode, where focus deliberately stays in the
  // host editor so the anchored selection + toolbar survive.
  useEffect(() => {
    if (preserveSelection) {
      wasOpenRef.current = open;
      return;
    }
    if (open) {
      firstPresetRef.current?.focus();
    } else if (wasOpenRef.current) {
      triggerRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open, preserveSelection]);

  // Trap Tab within the popover so keyboard focus can't escape behind it while
  // it's open (skipped in `preserveSelection` mode, which keeps editor focus).
  const onContentKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== "Tab" || preserveSelection) {
        return;
      }
      const focusables = contentRef.current?.querySelectorAll<HTMLElement>(
        'button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) {
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement;
      if (event.shiftKey && activeEl === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [preserveSelection],
  );

  // In `preserveSelection` mode, swallow the pointer-down default so clicking a
  // preset never blurs the editor (the anchored selection + toolbar stay alive).
  const onPointerDownCapture = preserveSelection
    ? (event: MouseEvent) => event.preventDefault()
    : undefined;

  const pick = useCallback(
    (next: string) => {
      onChange(next);
    },
    [onChange],
  );

  return (
    <>
      <Swatch
        ref={triggerRef}
        color={icon ? "transparent" : hex}
        size={size}
        selected={active && !icon}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {icon ? (
          <span className="relative flex h-full w-full items-center justify-center text-[var(--ds-text-secondary,#52525b)]">
            {icon}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[2px] left-1 right-1 h-[3px] rounded-full border border-[var(--ds-border,rgba(0,0,0,0.12))]"
              style={{ backgroundColor: hasColor ? hex : "transparent" }}
            />
          </span>
        ) : null}
      </Swatch>
      <FloatingSurface
        open={open}
        onClose={() => setOpen(false)}
        position={coords}
        role="dialog"
        aria-label={`${ariaLabel} picker`}
        elevation="popover"
        radius="lg"
        style={{ width: PICKER_WIDTH }}
      >
        <div
          ref={contentRef}
          data-ds-floating="color-picker"
          className="p-2"
          onKeyDown={onContentKeyDown}
        >
          <p
            id={labelId}
            className="mb-1.5 px-0.5 text-[11px] font-medium text-[var(--ds-text-muted,#6f7d83)]"
          >
            {ariaLabel}
          </p>
          {onReset ? (
            <button
              type="button"
              onMouseDown={onPointerDownCapture}
              onClick={() => {
                onReset();
                setOpen(false);
              }}
              className={cx(
                "mb-1.5 flex w-full items-center gap-2 px-1.5 py-1 text-left text-xs text-[var(--ds-text,#18181b)] hover:bg-[var(--ds-surface-hover,rgba(0,0,0,0.05))]",
                RADIUS.sm,
                FOCUS_RING,
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  "flex h-4 w-4 items-center justify-center overflow-hidden border border-[var(--ds-border,rgba(0,0,0,0.12))]",
                  RADIUS.sm,
                )}
              >
                <span className="block h-px w-5 -rotate-45 bg-[var(--ds-border-strong,rgba(0,0,0,0.3))]" />
              </span>
              {resetLabel}
            </button>
          ) : null}
          <div
            role="group"
            aria-labelledby={labelId}
            className="grid grid-cols-6 gap-1.5"
          >
            {presets.map((preset, index) => (
              <Swatch
                key={`${preset}-${index}`}
                ref={index === 0 ? firstPresetRef : undefined}
                color={preset}
                size="md"
                selected={toHex(preset, "") === hex}
                aria-label={preset}
                onMouseDown={onPointerDownCapture}
                onClick={() => pick(preset)}
              />
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 border-t border-[var(--ds-border,rgba(0,0,0,0.08))] pt-2 text-[11px] text-[var(--ds-text-muted,#6f7d83)]">
            <input
              type="color"
              aria-label={`${ariaLabel} custom value`}
              value={hex}
              onChange={(event) => pick(event.target.value)}
              className={cx(
                "h-7 w-9 shrink-0 cursor-pointer border border-[var(--ds-border,rgba(0,0,0,0.12))] bg-transparent p-0.5",
                RADIUS.sm,
              )}
            />
            <input
              type="text"
              aria-label={`${ariaLabel} hex value`}
              value={hex}
              spellCheck={false}
              onChange={(event) => {
                const value = event.target.value.trim();
                if (/^#[0-9a-fA-F]{6}$/.test(value)) {
                  pick(value.toLowerCase());
                }
              }}
              className={cx(
                "h-7 w-full min-w-0 border border-[var(--ds-border,rgba(0,0,0,0.12))] bg-[var(--ds-surface,#ffffff)] px-2 font-mono text-xs tabular-nums text-[var(--ds-text,#18181b)] outline-none",
                RADIUS.sm,
                FOCUS_RING,
              )}
            />
          </label>
        </div>
      </FloatingSurface>
    </>
  );
}
