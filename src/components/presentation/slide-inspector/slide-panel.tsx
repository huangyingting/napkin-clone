"use client";

import { useState } from "react";

import { ColorPicker, Swatch } from "@/components/ui";
import { FOCUS_RING } from "@/components/ui/tokens";

/**
 * Per-slide color override. The presentation-theme preset swatches are the primary
 * interaction; the raw `<input type=color>` is hidden behind a "Custom…"
 * progressive-disclosure toggle so the token-driven theme colors stay
 * front-and-centre. "Theme" clears the override entirely.
 */
export function ColorOverride({
  label,
  value,
  fallback,
  presets,
  onChange,
}: {
  label: string;
  value: string | undefined;
  fallback: string;
  presets: readonly string[];
  onChange: (color: string | undefined) => void;
}) {
  const normalized = value?.toLowerCase();
  const matchesPreset =
    normalized !== undefined &&
    presets.some((preset) => preset.toLowerCase() === normalized);
  const [showCustom, setShowCustom] = useState(
    value !== undefined && !matchesPreset,
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ds-text-secondary">
          {label}
        </span>
        {value !== undefined ? (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className={`text-xs text-ds-text-muted underline hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            Theme
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((preset) => (
          <Swatch
            key={preset}
            color={preset}
            size="md"
            selected={normalized === preset.toLowerCase()}
            aria-label={`${label} ${preset}`}
            onClick={() => onChange(preset)}
          />
        ))}
        <button
          type="button"
          onClick={() => setShowCustom((open) => !open)}
          aria-expanded={showCustom}
          className={`ml-0.5 text-xs text-ds-text-muted underline hover:text-ds-text-primary ${FOCUS_RING}`}
        >
          Custom…
        </button>
      </div>
      {showCustom ? (
        <div className="flex items-center gap-2">
          <ColorPicker
            color={value ?? fallback}
            onChange={onChange}
            aria-label={`${label} custom color`}
          />
          <span className="font-mono text-xs tabular-nums text-ds-text-secondary">
            {(value ?? fallback).toLowerCase()}
          </span>
        </div>
      ) : null}
    </div>
  );
}
