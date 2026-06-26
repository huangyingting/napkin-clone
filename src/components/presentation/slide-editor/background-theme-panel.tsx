"use client";

import { useState } from "react";
import { ChevronLeft, Palette } from "lucide-react";

import { FOCUS_RING } from "@/components/ui/tokens";
import { ColorPicker } from "@/components/ui/color-picker";

type BackgroundGradient = { from: string; to: string; angle?: number };

const SOLID_BACKGROUND_OPTIONS: {
  id: string;
  label: string;
  color: string;
}[] = [
  { id: "black", label: "Black", color: "#050505" },
  { id: "graphite", label: "Graphite", color: "#525252" },
  { id: "ash", label: "Ash", color: "#737373" },
  { id: "stone", label: "Stone", color: "#a3a3a3" },
  { id: "silver", label: "Silver", color: "#b8b8b8" },
  { id: "mist", label: "Mist", color: "#d4d4d4" },
  { id: "white", label: "White", color: "#fbfbfb" },
  { id: "vermillion", label: "Vermillion", color: "#df4038" },
  { id: "coral", label: "Coral", color: "#df625d" },
  { id: "orchid", label: "Orchid", color: "#d662b8" },
  { id: "lilac", label: "Lilac", color: "#caa2e7" },
  { id: "violet", label: "Violet", color: "#ad6ddd" },
  { id: "iris", label: "Iris", color: "#7b5cf0" },
  { id: "royal", label: "Royal", color: "#512ddc" },
  { id: "fjord", label: "Fjord", color: "#5799af" },
  { id: "sky", label: "Sky", color: "#6dbbd5" },
  { id: "aqua", label: "Aqua", color: "#8bd6d8" },
  { id: "azure", label: "Azure", color: "#6aaef0" },
  { id: "periwinkle", label: "Periwinkle", color: "#6374ee" },
  { id: "cobalt", label: "Cobalt", color: "#3455ad" },
  { id: "indigo", label: "Indigo", color: "#24139b" },
  { id: "leaf", label: "Leaf", color: "#66ba69" },
  { id: "lime", label: "Lime", color: "#9bd363" },
  { id: "sprout", label: "Sprout", color: "#cbfb6f" },
  { id: "sun", label: "Sun", color: "#f6dc62" },
  { id: "sand", label: "Sand", color: "#efbf61" },
  { id: "apricot", label: "Apricot", color: "#e99350" },
  { id: "orange", label: "Orange", color: "#e5782e" },
];

const GRADIENT_BACKGROUND_OPTIONS: {
  id: string;
  label: string;
  gradient: BackgroundGradient;
}[] = [
  {
    id: "black-gloss",
    label: "Black gloss",
    gradient: { from: "#050505", to: "#525252", angle: 90 },
  },
  {
    id: "mono-shine",
    label: "Mono shine",
    gradient: { from: "#0b0b0b", to: "#f5f5f5", angle: 90 },
  },
  {
    id: "pearl",
    label: "Pearl",
    gradient: { from: "#a8a8a8", to: "#f7f7f7", angle: 135 },
  },
  {
    id: "lime-pop",
    label: "Lime pop",
    gradient: { from: "#8bd548", to: "#daf56d", angle: 135 },
  },
  {
    id: "gold-night",
    label: "Gold night",
    gradient: { from: "#0f0d05", to: "#99741a", angle: 90 },
  },
  {
    id: "sunset-glow",
    label: "Sunset glow",
    gradient: { from: "#7c3f96", to: "#f5d64d", angle: 90 },
  },
  {
    id: "deep-violet",
    label: "Deep violet",
    gradient: { from: "#060a36", to: "#2514a0", angle: 135 },
  },
  {
    id: "frost",
    label: "Frost",
    gradient: { from: "#d4f8de", to: "#b9c8ff", angle: 135 },
  },
  {
    id: "ember",
    label: "Ember",
    gradient: { from: "#dd3f3a", to: "#ec9a4e", angle: 135 },
  },
  {
    id: "berry",
    label: "Berry",
    gradient: { from: "#d94d59", to: "#7b5cf0", angle: 135 },
  },
  {
    id: "candy",
    label: "Candy",
    gradient: { from: "#5b73f0", to: "#d45fc4", angle: 135 },
  },
  {
    id: "cosmic",
    label: "Cosmic",
    gradient: { from: "#2f58b8", to: "#8b4fda", angle: 135 },
  },
  {
    id: "aqua-pop",
    label: "Aqua pop",
    gradient: { from: "#7a5cf2", to: "#78d5dd", angle: 135 },
  },
  {
    id: "ocean",
    label: "Ocean",
    gradient: { from: "#70ced8", to: "#3455ad", angle: 135 },
  },
  {
    id: "rainforest",
    label: "Rainforest",
    gradient: { from: "#745cf0", to: "#58b96a", angle: 135 },
  },
  {
    id: "meadow",
    label: "Meadow",
    gradient: { from: "#5e9eaf", to: "#98d45f", angle: 135 },
  },
  {
    id: "sea-lime",
    label: "Sea lime",
    gradient: { from: "#63b7d6", to: "#e8df66", angle: 135 },
  },
  {
    id: "honey",
    label: "Honey",
    gradient: { from: "#f8d35a", to: "#ee9f51", angle: 135 },
  },
  {
    id: "peach",
    label: "Peach",
    gradient: { from: "#d95faa", to: "#f2d65d", angle: 135 },
  },
  {
    id: "blush",
    label: "Blush",
    gradient: { from: "#fff2a8", to: "#e5a7f0", angle: 135 },
  },
  {
    id: "sherbet",
    label: "Sherbet",
    gradient: { from: "#7b5cf0", to: "#e99350", angle: 135 },
  },
];

function gradientCss(gradient: BackgroundGradient): string {
  return `linear-gradient(${gradient.angle ?? 135}deg, ${gradient.from}, ${gradient.to})`;
}

function isCompleteHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function swatchColor(value: string, fallback: string): string {
  return isCompleteHexColor(value) ? value : fallback;
}

/** Grid of circular color swatch buttons used for solid and gradient presets. */
function BackgroundPresetGrid({
  options,
  activeId,
}: {
  options: {
    id: string;
    ariaLabel: string;
    title: string;
    onClick: () => void;
    style: React.CSSProperties;
  }[];
  activeId: string | undefined;
}) {
  return (
    <div className="grid grid-cols-7 gap-x-2 gap-y-3">
      {options.map((option) => {
        const active = activeId === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-label={option.ariaLabel}
            aria-pressed={active}
            onClick={option.onClick}
            title={option.title}
            className={`h-8 w-8 rounded-full border shadow-sm transition-transform hover:scale-105 ${
              active
                ? "border-ds-accent ring-2 ring-ds-accent ring-offset-2 ring-offset-ds-surface-overlay"
                : "border-ds-border-subtle"
            } ${FOCUS_RING}`}
            style={option.style}
          />
        );
      })}
    </div>
  );
}

/** Labelled range input for the gradient angle, with a live degree readout. */
function GradientAngleInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (angle: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5">
      <span className="w-10 text-xs font-medium text-ds-text-secondary">
        Angle
      </span>
      <input
        type="range"
        min={0}
        max={360}
        step={5}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-w-0 flex-1 accent-ds-accent"
        aria-label="Gradient angle"
      />
      <span className="w-9 text-right text-xs tabular-nums text-ds-text-muted">
        {value}°
      </span>
    </label>
  );
}

export function BackgroundThemePanel({
  activeSolidId,
  activeGradientId,
  onPickSolid,
  onPickGradient,
}: {
  activeSolidId?: string;
  activeGradientId?: string;
  onPickSolid: (color: string) => void;
  onPickGradient: (gradient: BackgroundGradient) => void;
}) {
  const [view, setView] = useState<"presets" | "customize">("presets");
  const [customMode, setCustomMode] = useState<"solid" | "gradient">("solid");
  const [customSolid, setCustomSolid] = useState("#2563eb");
  const [customGradientFrom, setCustomGradientFrom] = useState("#6366f1");
  const [customGradientTo, setCustomGradientTo] = useState("#ec4899");
  const [customGradientAngle, setCustomGradientAngle] = useState(135);
  const [activeGradientStop, setActiveGradientStop] = useState<"from" | "to">(
    "from",
  );

  const openCustomize = (mode: "solid" | "gradient") => {
    setCustomMode(mode);
    setView("customize");
  };

  if (view === "customize") {
    const solidPreview = swatchColor(customSolid, "#2563eb");
    const gradientFromPreview = swatchColor(customGradientFrom, "#6366f1");
    const gradientToPreview = swatchColor(customGradientTo, "#ec4899");
    const customGradient = {
      from: gradientFromPreview,
      to: gradientToPreview,
      angle: customGradientAngle,
    };

    return (
      <div className="flex w-[272px] flex-col gap-4 p-1">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setView("presets")}
            className={`flex h-7 items-center gap-1 rounded-ds-sm px-1.5 text-xs font-semibold text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Back
          </button>
          <span className="text-xs font-bold uppercase tracking-wide text-ds-text-muted">
            Customize
          </span>
        </div>

        <div
          role="tablist"
          aria-label="Custom background type"
          className="grid grid-cols-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={customMode === "solid"}
            onClick={() => setCustomMode("solid")}
            className={`rounded-ds-sm px-2 py-1 text-xs font-semibold transition-colors ${
              customMode === "solid"
                ? "bg-ds-accent-surface text-ds-accent-text"
                : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
            } ${FOCUS_RING}`}
          >
            Solid
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={customMode === "gradient"}
            onClick={() => setCustomMode("gradient")}
            className={`rounded-ds-sm px-2 py-1 text-xs font-semibold transition-colors ${
              customMode === "gradient"
                ? "bg-ds-accent-surface text-ds-accent-text"
                : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
            } ${FOCUS_RING}`}
          >
            Gradient
          </button>
        </div>

        {customMode === "solid" ? (
          <div className="flex flex-col gap-3">
            <ColorPicker
              color={customSolid}
              onChange={setCustomSolid}
              aria-label="Custom solid color"
              fallback="#2563eb"
            />
            <button
              type="button"
              onClick={() => onPickSolid(solidPreview)}
              disabled={!isCompleteHexColor(customSolid)}
              className={`h-8 rounded-ds-md bg-ds-accent px-3 text-xs font-semibold text-ds-text-on-accent transition-colors hover:bg-ds-accent-hover disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
            >
              Apply solid color
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <span
              aria-hidden="true"
              className="block h-14 rounded-ds-md border border-ds-border-subtle shadow-sm"
              style={{ background: gradientCss(customGradient) }}
            />
            <div className="grid grid-cols-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface p-0.5">
              <button
                type="button"
                aria-pressed={activeGradientStop === "from"}
                onClick={() => setActiveGradientStop("from")}
                className={`flex items-center justify-center gap-1.5 rounded-ds-sm px-2 py-1 text-xs font-semibold transition-colors ${
                  activeGradientStop === "from"
                    ? "bg-ds-accent-surface text-ds-accent-text"
                    : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
                } ${FOCUS_RING}`}
              >
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full border border-ds-border-subtle"
                  style={{ backgroundColor: gradientFromPreview }}
                />
                From
              </button>
              <button
                type="button"
                aria-pressed={activeGradientStop === "to"}
                onClick={() => setActiveGradientStop("to")}
                className={`flex items-center justify-center gap-1.5 rounded-ds-sm px-2 py-1 text-xs font-semibold transition-colors ${
                  activeGradientStop === "to"
                    ? "bg-ds-accent-surface text-ds-accent-text"
                    : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
                } ${FOCUS_RING}`}
              >
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full border border-ds-border-subtle"
                  style={{ backgroundColor: gradientToPreview }}
                />
                To
              </button>
            </div>
            <ColorPicker
              color={
                activeGradientStop === "from"
                  ? customGradientFrom
                  : customGradientTo
              }
              onChange={
                activeGradientStop === "from"
                  ? setCustomGradientFrom
                  : setCustomGradientTo
              }
              aria-label={
                activeGradientStop === "from"
                  ? "Gradient start color"
                  : "Gradient end color"
              }
              fallback={activeGradientStop === "from" ? "#6366f1" : "#ec4899"}
            />
            <GradientAngleInput
              value={customGradientAngle}
              onChange={setCustomGradientAngle}
            />
            <button
              type="button"
              onClick={() => onPickGradient(customGradient)}
              disabled={
                !isCompleteHexColor(customGradientFrom) ||
                !isCompleteHexColor(customGradientTo)
              }
              className={`h-8 rounded-ds-md bg-ds-accent px-3 text-xs font-semibold text-ds-text-on-accent transition-colors hover:bg-ds-accent-hover disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
            >
              Apply gradient
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-[272px] flex-col gap-5 p-1">
      <section aria-label="Solid color backgrounds">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Palette
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-ds-text-primary"
            />
            <h4 className="text-sm font-bold leading-none text-ds-text-primary">
              Default solid colors
            </h4>
          </div>
          <button
            type="button"
            onClick={() => openCustomize("solid")}
            className={`rounded-ds-sm px-1.5 py-1 text-xs font-semibold text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            Customize
          </button>
        </div>
        <BackgroundPresetGrid
          options={SOLID_BACKGROUND_OPTIONS.map((option) => ({
            id: option.id,
            ariaLabel: `Apply ${option.label} solid background to deck`,
            title: option.label,
            onClick: () => onPickSolid(option.color),
            style: { backgroundColor: option.color },
          }))}
          activeId={activeSolidId}
        />
      </section>

      <section aria-label="Gradient backgrounds">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-5 w-5 shrink-0 rounded-ds-sm border border-ds-text-primary p-0.5"
            >
              <span
                className="block h-full w-full rounded-[2px]"
                style={{
                  background:
                    "linear-gradient(90deg, #111827 0 33%, #737373 33% 66%, #f8fafc 66% 100%)",
                }}
              ></span>
            </span>
            <h4 className="text-sm font-bold leading-none text-ds-text-primary">
              Default gradient colors
            </h4>
          </div>
          <button
            type="button"
            onClick={() => openCustomize("gradient")}
            className={`rounded-ds-sm px-1.5 py-1 text-xs font-semibold text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            Customize
          </button>
        </div>
        <BackgroundPresetGrid
          options={GRADIENT_BACKGROUND_OPTIONS.map((option) => ({
            id: option.id,
            ariaLabel: `Apply ${option.label} gradient background to deck`,
            title: option.label,
            onClick: () => onPickGradient(option.gradient),
            style: { background: gradientCss(option.gradient) },
          }))}
          activeId={activeGradientId}
        />
      </section>
    </div>
  );
}
