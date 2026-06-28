"use client";

/**
 * Presentation theme panel (#613, #611, #612 + palette/gradient + presets).
 *
 * A compact two-view popover for the deck's *global* visual language (mirrors
 * the `theme-panel-palette` design exploration):
 *
 *  - **Preset view** — pick a built-in theme (one click applies it cleanly via
 *    `SET_PRESENTATION_THEME`) or apply / delete a saved **preset** from your library.
 *  - **Customize view** — two tabs:
 *      • **Palette** — semantic color tokens as a swatch grid, plus the deck
 *        **background** (Solid / Gradient with presets, From/To stops, angle).
 *      • **Typography** — per-role font / size / color for every
 *        {@link PresentationRole}, each with a live sample.
 *    Edits dispatch `UPDATE_THEME_OVERRIDES` patches (undoable, autosaved).
 *    **Save preset** snapshots the current token set into your library;
 *    **Reset to theme** clears the deck's theme override token set.
 */

import { useMemo, useState } from "react";

import {
  resolveRoleToken,
  PRESENTATION_ROLES,
  type BackgroundTreatment,
  type ColorToken,
  type PresentationRole,
  type PresentationTheme,
  type PresentationRoleToken,
} from "@/lib/presentation/presentation-theme";
import {
  THEME_PACKAGES,
  resolveThemePackageId,
  type ThemePackageId,
} from "@/lib/presentation/theme-packages";
import type { PresentationThemeOverridesPatch } from "@/lib/presentation/deck-mutations";
import {
  deleteThemePreset,
  listThemePresets,
  saveThemePreset,
  type CustomThemePreset,
} from "@/lib/presentation/theme-preset-store";
import { SLIDE_FONT_OPTIONS } from "@/lib/presentation/slide-fonts";
import {
  ColorPicker,
  SegmentedControl,
  SelectMenu,
  type SelectMenuOption,
} from "@/components/ui";
import { cx, FOCUS_RING } from "@/components/ui/tokens";

// ---------------------------------------------------------------------------
// Static config
// ---------------------------------------------------------------------------

type PanelTab = "palette" | "type";
type PanelView = "preset" | "customize";

const PACKAGE_PRESETS = THEME_PACKAGES;

/** Editable palette tokens (slideBg is owned by the Background section). */
const COLOR_FIELDS: ReadonlyArray<{ key: keyof ColorToken; label: string }> = [
  { key: "accent", label: "Accent" },
  { key: "onBg", label: "Text" },
  { key: "surface", label: "Surface" },
  { key: "onSurface", label: "On surface" },
  { key: "onAccent", label: "On accent" },
  { key: "muted", label: "Muted" },
];

/** Tokens shown in a preset card's mini palette strip. */
const PREVIEW_KEYS: ReadonlyArray<keyof ColorToken> = [
  "slideBg",
  "surface",
  "accent",
  "onBg",
];

const ROLE_LABELS: Record<PresentationRole, string> = {
  title: "Title",
  subtitle: "Subtitle",
  sectionTitle: "Section title",
  body: "Body",
  bullet: "Bullet",
  quote: "Quote",
  caption: "Caption",
  footer: "Footer",
  label: "Label",
  media: "Media",
  visual: "Visual",
  image: "Image",
  logo: "Logo",
  pageNumber: "Page number",
  background: "Background",
};

const FONT_OPTIONS: ReadonlyArray<{ value: string; label: string }> =
  SLIDE_FONT_OPTIONS.map((f) => ({ value: f.value, label: f.label }));

/** Curated gradient backgrounds for one-click selection. */
const GRADIENT_PRESETS: ReadonlyArray<{ from: string; to: string }> = [
  { from: "#eef2ff", to: "#c7d2fe" },
  { from: "#f0f9ff", to: "#bae6fd" },
  { from: "#f0fdf4", to: "#bbf7d0" },
  { from: "#fff7ed", to: "#fed7aa" },
  { from: "#faf5ff", to: "#e9d5ff" },
  { from: "#f8fafc", to: "#cbd5e1" },
  { from: "#4f46e5", to: "#9333ea" },
  { from: "#f59e0b", to: "#ef4444" },
];

const DEFAULT_GRADIENT_ANGLE = 135;

function gradientCss(g: { from: string; to: string; angle?: number }): string {
  return `linear-gradient(${g.angle ?? DEFAULT_GRADIENT_ANGLE}deg, ${g.from}, ${g.to})`;
}

/**
 * Builds a comprehensive {@link PresentationThemeOverridesPatch} that reproduces `ts`'s
 * colors, typography, background, and non-text defaults — used to *apply* a
 * saved preset on top of the deck's current theme via `UPDATE_THEME_OVERRIDES`.
 */
function tokenSetToTemplatePatch(
  ts: PresentationTheme,
): PresentationThemeOverridesPatch {
  const roles: Partial<
    Record<PresentationRole, Partial<PresentationRoleToken>>
  > = {};
  for (const role of PRESENTATION_ROLES) {
    roles[role] = { ...resolveRoleToken(ts, role) };
  }
  return {
    colors: { ...ts.colors },
    typography: {
      fontFamily: ts.typography.fontFamily,
      headingFontFamily: ts.typography.headingFontFamily,
      roles,
    },
    defaultBackground: ts.defaultBackground,
    ...(ts.bullet ? { bullet: ts.bullet } : {}),
    ...(ts.connector ? { connector: ts.connector } : {}),
    ...(ts.image ? { image: ts.image } : {}),
    ...(ts.visual ? { visual: ts.visual } : {}),
  };
}

// ---------------------------------------------------------------------------
// Small styled controls (ds-token driven)
// ---------------------------------------------------------------------------

const LINK_BTN = cx(
  "rounded-ds-sm px-1.5 py-1 text-xs font-semibold text-ds-text-secondary transition-colors",
  "hover:bg-ds-state-hover hover:text-ds-text-primary disabled:cursor-not-allowed disabled:opacity-40",
  FOCUS_RING,
);

function FontSelect({
  value,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (family: string) => void;
  "aria-label": string;
}) {
  const known = FONT_OPTIONS.some((f) => f.value === value);
  const options: SelectMenuOption[] = [
    ...(!known && value ? [{ value, label: "Current" }] : []),
    ...FONT_OPTIONS.map((f) => ({ value: f.value, label: f.label })),
  ];
  return (
    <SelectMenu
      variant="field"
      value={value}
      options={options}
      onChange={onChange}
      aria-label={ariaLabel}
    />
  );
}

function SizeInput({
  value,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: number;
  onChange: (pt: number) => void;
  "aria-label": string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      defaultValue={String(value)}
      key={value}
      onBlur={(e) => {
        const next = Number.parseFloat(e.target.value);
        if (Number.isFinite(next) && next > 0 && next !== value) onChange(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={cx(
        "h-7 w-10 rounded-ds-sm border border-ds-border-subtle bg-ds-surface-raised px-1 text-center text-[11px] text-ds-text-primary",
        FOCUS_RING,
      )}
    />
  );
}

/** A small palette strip used on preset cards. */
function PaletteStrip({ colors }: { colors: ColorToken }) {
  return (
    <span aria-hidden="true" className="flex gap-0.5">
      {PREVIEW_KEYS.map((key) => (
        <span
          key={key}
          className="h-2.5 w-2.5 rounded-sm border border-ds-border-subtle"
          style={{ backgroundColor: colors[key] }}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Background (Solid / Gradient)
// ---------------------------------------------------------------------------

function GradientControls({
  value,
  presets,
  onCommit,
}: {
  value: { from: string; to: string; angle: number };
  presets: readonly string[];
  onCommit: (g: { from: string; to: string; angle: number }) => void;
}) {
  // Local angle so dragging the slider doesn't spam the undo history; the value
  // is committed on release. Re-sync (during render) when the persisted gradient
  // changes externally — the React-recommended alternative to a sync effect.
  const [angle, setAngle] = useState(value.angle);
  const [syncedAngle, setSyncedAngle] = useState(value.angle);
  if (value.angle !== syncedAngle) {
    setSyncedAngle(value.angle);
    setAngle(value.angle);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        aria-hidden="true"
        className="h-8 rounded-ds-sm border border-ds-border-subtle"
        style={{ background: gradientCss({ ...value, angle }) }}
      />

      <div className="flex flex-wrap gap-1.5">
        {GRADIENT_PRESETS.map((p) => {
          const active =
            p.from.toLowerCase() === value.from.toLowerCase() &&
            p.to.toLowerCase() === value.to.toLowerCase();
          return (
            <button
              key={`${p.from}-${p.to}`}
              type="button"
              aria-label={`Gradient ${p.from} to ${p.to}`}
              aria-pressed={active}
              onClick={() => onCommit({ from: p.from, to: p.to, angle })}
              className={cx(
                "h-6 w-9 rounded-ds-sm border transition-shadow",
                active
                  ? "border-ds-accent ring-2 ring-ds-accent-surface"
                  : "border-ds-border-subtle hover:ring-2 hover:ring-ds-border-strong",
                FOCUS_RING,
              )}
              style={{ background: gradientCss({ ...p, angle: 135 }) }}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center justify-between gap-2 text-[11px] font-medium text-ds-text-secondary">
          <span>From</span>
          <ColorPicker
            aria-label="Gradient start color"
            color={value.from}
            presets={presets}
            size="sm"
            onChange={(hex) => onCommit({ from: hex, to: value.to, angle })}
          />
        </label>
        <label className="flex items-center justify-between gap-2 text-[11px] font-medium text-ds-text-secondary">
          <span>To</span>
          <ColorPicker
            aria-label="Gradient end color"
            color={value.to}
            presets={presets}
            size="sm"
            onChange={(hex) => onCommit({ from: value.from, to: hex, angle })}
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-ds-text-secondary">
          Angle
        </span>
        <input
          type="range"
          min={0}
          max={360}
          aria-label="Gradient angle"
          value={angle}
          onChange={(e) => setAngle(Number(e.target.value))}
          onPointerUp={() =>
            onCommit({ from: value.from, to: value.to, angle })
          }
          onKeyUp={() => onCommit({ from: value.from, to: value.to, angle })}
          className="h-1.5 flex-1 accent-ds-accent"
        />
        <span className="w-9 text-right font-mono text-[11px] text-ds-text-muted">
          {angle}°
        </span>
      </div>
    </div>
  );
}

function BackgroundSection({
  tokenSet,
  presets,
  onUpdate,
}: {
  tokenSet: PresentationTheme;
  presets: readonly string[];
  onUpdate: (patch: PresentationThemeOverridesPatch) => void;
}) {
  const bg: BackgroundTreatment = tokenSet.defaultBackground;
  const mode: "solid" | "gradient" =
    bg.type === "gradient" ? "gradient" : "solid";
  const solidColor = bg.type === "solid" ? bg.color : tokenSet.colors.slideBg;
  const gradient =
    bg.type === "gradient"
      ? { from: bg.from, to: bg.to, angle: bg.angle ?? DEFAULT_GRADIENT_ANGLE }
      : {
          from: solidColor,
          to: tokenSet.colors.surface,
          angle: DEFAULT_GRADIENT_ANGLE,
        };

  return (
    <div className="flex flex-col gap-2.5 border-t border-ds-border-subtle pt-3">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ds-text-muted">
        Background
      </span>
      <SegmentedControl<"solid" | "gradient">
        aria-label="Background type"
        size="sm"
        className="w-full"
        stretch
        value={mode}
        options={[
          { value: "solid", label: "Solid" },
          { value: "gradient", label: "Gradient" },
        ]}
        onChange={(next) => {
          if (next === "solid") {
            onUpdate({
              defaultBackground: { type: "solid", color: solidColor },
            });
          } else {
            onUpdate({ defaultBackground: { type: "gradient", ...gradient } });
          }
        }}
      />

      {mode === "solid" ? (
        <label className="flex items-center justify-between gap-2 text-[11px] font-medium text-ds-text-secondary">
          <span>Background color</span>
          <ColorPicker
            aria-label="Background color"
            color={solidColor}
            presets={presets}
            size="sm"
            onChange={(hex) =>
              onUpdate({ defaultBackground: { type: "solid", color: hex } })
            }
          />
        </label>
      ) : (
        <GradientControls
          value={gradient}
          presets={presets}
          onCommit={(g) =>
            onUpdate({ defaultBackground: { type: "gradient", ...g } })
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preset view
// ---------------------------------------------------------------------------

function PresetCard({
  name,
  colors,
  active,
  onApply,
  onDelete,
}: {
  name: string;
  colors: ColorToken;
  active: boolean;
  onApply: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onApply}
        aria-pressed={active}
        className={cx(
          "flex w-full flex-col gap-1.5 rounded-ds-md border bg-ds-surface-raised p-2 text-left transition-shadow",
          active
            ? "border-ds-accent ring-2 ring-ds-accent-surface"
            : "border-ds-border-subtle hover:border-ds-border-strong",
          FOCUS_RING,
        )}
      >
        <span
          aria-hidden="true"
          className="h-9 w-full rounded-ds-sm border border-ds-border-subtle"
          style={{ backgroundColor: colors.slideBg }}
        >
          <span className="flex h-full items-end p-1">
            <PaletteStrip colors={colors} />
          </span>
        </span>
        <span className="truncate text-[11px] font-semibold text-ds-text-primary">
          {name}
        </span>
      </button>
      {onDelete ? (
        <button
          type="button"
          aria-label={`Delete preset ${name}`}
          onClick={onDelete}
          className={cx(
            "absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-ds-surface-overlay text-[10px] text-ds-text-muted shadow-ds-raised",
            "hover:text-ds-danger-text",
            FOCUS_RING,
          )}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function PresentationThemePanel({
  tokenSet,
  isCustom,
  themeId,
  onUpdate,
  onReset,
  onApplyThemePackage,
}: {
  /** The deck's resolved token set (custom set when present, else built-in). */
  tokenSet: PresentationTheme;
  /** Whether the deck currently has a theme override token set (enables Reset). */
  isCustom: boolean;
  /** The deck's active theme token id (for preset highlighting). */
  themeId: string;
  onUpdate: (patch: PresentationThemeOverridesPatch) => void;
  onReset: () => void;
  /** Applies a theme package: tokens, masters, and package templates. */
  onApplyThemePackage: (themeId: ThemePackageId) => void;
}) {
  const [view, setView] = useState<PanelView>("preset");
  const [tab, setTab] = useState<PanelTab>("palette");
  const [savingName, setSavingName] = useState<string | null>(null);
  // Bump to re-read the (localStorage) preset library after save/delete.
  const [storeTick, setStoreTick] = useState(0);
  const presets = useMemo<CustomThemePreset[]>(
    () => listThemePresets(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storeTick],
  );

  // Surface the live palette as picker presets so brand colors come first.
  const palettePresets: readonly string[] = [
    tokenSet.colors.accent,
    tokenSet.colors.onBg,
    tokenSet.colors.surface,
    tokenSet.colors.onSurface,
    tokenSet.colors.muted,
    tokenSet.colors.slideBg,
    "#000000",
    "#ffffff",
  ];

  // ── Preset view ────────────────────────────────────────────────────────
  if (view === "preset") {
    return (
      <div className="flex w-[300px] flex-col gap-3 p-1">
        <div className="flex items-center justify-between gap-2">
          <span className="flex flex-1 justify-start">
            {isCustom ? (
              <span className="rounded-ds-pill bg-ds-accent-surface px-2 py-0.5 text-[10px] font-bold text-ds-accent-text">
                Customized
              </span>
            ) : null}
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-ds-text-muted">
            Slide kit
          </span>
          <span className="flex flex-1 justify-end">
            <button
              type="button"
              onClick={() => setView("customize")}
              className={LINK_BTN}
            >
              Customize style
            </button>
          </span>
        </div>

        <div className="flex max-h-[52vh] flex-col gap-3 overflow-y-auto pr-0.5">
          <div className="flex flex-col gap-2">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ds-text-muted">
              Slide kits
            </span>
            <div className="grid grid-cols-2 gap-2">
              {PACKAGE_PRESETS.map((themePackage) => (
                <PresetCard
                  key={themePackage.id}
                  name={themePackage.name}
                  colors={themePackage.tokenSet.colors}
                  active={resolveThemePackageId(themeId) === themePackage.id}
                  onApply={() => onApplyThemePackage(themePackage.id)}
                />
              ))}
            </div>
          </div>

          {presets.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ds-text-muted">
                Style presets
              </span>
              <div className="grid grid-cols-2 gap-2">
                {presets.map((preset) => (
                  <PresetCard
                    key={preset.id}
                    name={preset.name}
                    colors={preset.tokenSet.colors}
                    active={false}
                    onApply={() =>
                      onUpdate(tokenSetToTemplatePatch(preset.tokenSet))
                    }
                    onDelete={() => {
                      deleteThemePreset(preset.id);
                      setStoreTick((n) => n + 1);
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // ── Customize view ─────────────────────────────────────────────────────
  return (
    <div className="flex w-[300px] flex-col gap-3 p-1">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex flex-1 justify-start">
          <button
            type="button"
            onClick={() => setView("preset")}
            aria-label="Back to presets"
            className={cx(LINK_BTN, "px-1")}
          >
            ‹ Back
          </button>
        </span>
        <span className="text-xs font-bold uppercase tracking-wide text-ds-text-muted">
          Customize style
        </span>
        <span className="flex flex-1 justify-end">
          <button
            type="button"
            onClick={onReset}
            disabled={!isCustom}
            className={LINK_BTN}
          >
            Reset style
          </button>
        </span>
      </div>

      {/* Tabs */}
      <SegmentedControl<PanelTab>
        aria-label="Theme editor section"
        size="sm"
        className="w-full"
        stretch
        value={tab}
        options={[
          { value: "palette", label: "Palette" },
          { value: "type", label: "Typography" },
        ]}
        onChange={setTab}
      />

      {tab === "palette" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ds-text-muted">
              Color palette
            </span>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {COLOR_FIELDS.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center justify-between gap-2 text-[11px] font-medium text-ds-text-secondary"
                >
                  <span className="truncate">{label}</span>
                  <ColorPicker
                    aria-label={`${label} color`}
                    color={tokenSet.colors[key]}
                    presets={palettePresets}
                    size="sm"
                    onChange={(hex) => onUpdate({ colors: { [key]: hex } })}
                  />
                </label>
              ))}
            </div>
          </div>

          <BackgroundSection
            tokenSet={tokenSet}
            presets={palettePresets}
            onUpdate={onUpdate}
          />
        </div>
      ) : (
        <div className="flex max-h-[40vh] flex-col gap-2.5 overflow-y-auto pr-0.5">
          {PRESENTATION_ROLES.map((role) => {
            const token = resolveRoleToken(tokenSet, role);
            return (
              <div key={role} className="flex flex-col gap-1.5">
                <span
                  className="truncate"
                  style={{
                    fontFamily: token.fontFamily,
                    fontSize: `${Math.min(token.fontSize, 18)}px`,
                    fontWeight: token.weight,
                    fontStyle: token.italic ? "italic" : "normal",
                    color: token.color,
                  }}
                >
                  {ROLE_LABELS[role]}
                </span>
                <div className="flex items-center gap-1.5">
                  <FontSelect
                    aria-label={`${ROLE_LABELS[role]} font`}
                    value={token.fontFamily ?? ""}
                    onChange={(family) =>
                      onUpdate({
                        typography: {
                          roles: { [role]: { fontFamily: family } },
                        },
                      })
                    }
                  />
                  <SizeInput
                    aria-label={`${ROLE_LABELS[role]} size`}
                    value={token.fontSize}
                    onChange={(pt) =>
                      onUpdate({
                        typography: { roles: { [role]: { fontSize: pt } } },
                      })
                    }
                  />
                  <ColorPicker
                    aria-label={`${ROLE_LABELS[role]} color`}
                    color={token.color}
                    presets={palettePresets}
                    size="sm"
                    onChange={(hex) =>
                      onUpdate({
                        typography: { roles: { [role]: { color: hex } } },
                      })
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Save preset footer */}
      <div className="border-t border-ds-border-subtle pt-2.5">
        {savingName === null ? (
          <button
            type="button"
            onClick={() => setSavingName(`${tokenSet.name} custom`)}
            className={cx(
              "w-full rounded-ds-sm border border-ds-border-subtle bg-ds-surface-raised px-2 py-1.5 text-xs font-semibold text-ds-text-secondary transition-colors",
              "hover:bg-ds-state-hover hover:text-ds-text-primary",
              FOCUS_RING,
            )}
          >
            Save as preset
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              autoFocus
              aria-label="Preset name"
              value={savingName}
              onChange={(e) => setSavingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  saveThemePreset(savingName, tokenSet);
                  setStoreTick((n) => n + 1);
                  setSavingName(null);
                } else if (e.key === "Escape") {
                  setSavingName(null);
                }
              }}
              className={cx(
                "h-7 flex-1 rounded-ds-sm border border-ds-border-subtle bg-ds-surface-raised px-1.5 text-[11px] text-ds-text-primary",
                FOCUS_RING,
              )}
            />
            <button
              type="button"
              onClick={() => setSavingName(null)}
              className={cx(LINK_BTN, "px-2")}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                saveThemePreset(savingName, tokenSet);
                setStoreTick((n) => n + 1);
                setSavingName(null);
              }}
              className={cx(
                "rounded-ds-sm bg-ds-accent px-2.5 py-1 text-xs font-semibold text-ds-text-on-accent transition-colors hover:bg-ds-accent-hover",
                FOCUS_RING,
              )}
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
