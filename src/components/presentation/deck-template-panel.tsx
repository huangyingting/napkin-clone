"use client";

/**
 * Deck template editor panel (#613, #611, #612).
 *
 * Edits the deck's *global* visual language in one place: accent + text colors
 * and the semantic typography roles (H1/H2/H3/Body/Bullet). Each role shows a
 * live sample rendered from the resolved role token so changes are
 * understandable before they propagate. Edits are dispatched as
 * `UPDATE_DECK_TEMPLATE` patches (undoable, autosaved via #614); "Reset to
 * theme" clears the deck's custom token set.
 */

import { useId } from "react";

import {
  resolveRoleToken,
  type DeckTextRole,
  type DeckThemeTokenSet,
} from "@/lib/presentation/deck-theme-tokens";
import type { DeckTemplatePatch } from "@/lib/presentation/deck-mutations";
import { FOCUS_RING } from "@/components/ui/tokens";

/** Roles surfaced in the editor, with friendly labels and sample text. */
const ROLE_ROWS: ReadonlyArray<{ role: DeckTextRole; label: string }> = [
  { role: "h1", label: "Heading 1" },
  { role: "h2", label: "Heading 2" },
  { role: "h3", label: "Heading 3" },
  { role: "body", label: "Body" },
  { role: "bullet", label: "Bullet" },
];

function isHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex items-center justify-between gap-2 text-xs text-ds-text-secondary"
    >
      <span>{label}</span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-4 w-4 shrink-0 rounded-ds-sm border border-ds-border-subtle"
          style={{ backgroundColor: value }}
        />
        <input
          id={id}
          type="text"
          spellCheck={false}
          defaultValue={value}
          aria-label={`${label} hex color`}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (isHex(v) && v.toLowerCase() !== value.toLowerCase())
              onChange(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className={`w-20 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-1.5 py-1 font-mono text-[11px] text-ds-text-primary ${FOCUS_RING}`}
        />
      </span>
    </label>
  );
}

export function DeckTemplatePanel({
  tokenSet,
  isCustom,
  onUpdate,
  onReset,
}: {
  /** The deck's resolved token set (custom set when present, else built-in). */
  tokenSet: DeckThemeTokenSet;
  /** Whether the deck currently has a custom token set (enables Reset). */
  isCustom: boolean;
  onUpdate: (patch: DeckTemplatePatch) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex w-[280px] flex-col gap-4 p-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-ds-text-muted">
          Deck theme
        </span>
        <button
          type="button"
          onClick={onReset}
          disabled={!isCustom}
          className={`rounded-ds-sm px-1.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
        >
          Reset to theme
        </button>
      </div>

      {/* Global colors */}
      <div className="flex flex-col gap-2">
        <ColorField
          label="Accent"
          value={tokenSet.colors.accent}
          onChange={(hex) => onUpdate({ colors: { accent: hex } })}
        />
        <ColorField
          label="Text"
          value={tokenSet.colors.onBg}
          onChange={(hex) => onUpdate({ colors: { onBg: hex } })}
        />
      </div>

      {/* Role typography with live samples */}
      <div className="flex flex-col gap-2.5 border-t border-ds-border-subtle pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ds-text-muted">
          Text roles
        </span>
        {ROLE_ROWS.map(({ role, label }) => {
          const token = resolveRoleToken(tokenSet, role);
          return (
            <div key={role} className="flex flex-col gap-1">
              {/* Live sample so a global change is understandable before/after */}
              <span
                className="truncate"
                style={{
                  fontFamily: token.fontFamily,
                  // cap the preview size so large roles still fit the popover
                  fontSize: `${Math.min(token.fontSize, 20)}px`,
                  fontWeight: token.weight,
                  fontStyle: token.italic ? "italic" : "normal",
                  color: token.color,
                }}
              >
                {label}
              </span>
              <ColorField
                label={`${label} color`}
                value={token.color}
                onChange={(hex) =>
                  onUpdate({
                    typography: { roles: { [role]: { color: hex } } },
                  })
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
