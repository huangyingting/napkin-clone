"use client";

/**
 * Shared text-style control set for the slide editor.
 *
 * A single source of truth for the bold / italic / alignment / font-size /
 * color controls so text controls in the inspector stay consistent wherever
 * text element properties are edited.
 *
 * Two presentations share one control set:
 *  - `"compact"` — icon-only buttons for dense tool surfaces.
 *  - `"labeled"` — the same controls with field labels for the side inspector.
 *
 * Purely controlled: every change is reported through `onChange`; the component
 * never mutates the element.
 */

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Minus,
  Palette,
  Plus,
  Underline,
  type LucideIcon,
} from "lucide-react";

import {
  ColorPicker,
  IconActionCluster,
  ToolbarButton,
  Tooltip,
} from "@/components/ui";
import type { ElementAlign, TextElementStyle } from "@/lib/presentation/deck";
import {
  ALIGN_OPTIONS,
  FONT_STEP,
  stepFontSize,
} from "@/lib/presentation/text-style";

const ALIGN_ICON: Record<ElementAlign, LucideIcon> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
};

const ALIGN_LABEL: Record<ElementAlign, string> = {
  left: "Align left",
  center: "Align center",
  right: "Align right",
};

const LABEL_CLASS = "text-xs font-medium text-ds-text-secondary";

export type TextStyleBarVariant = "compact" | "labeled";

export interface TextStyleBarProps {
  style: TextElementStyle;
  onChange: (style: TextElementStyle) => void;
  /** `"compact"` for the on-canvas toolbar, `"labeled"` for the inspector. */
  variant: TextStyleBarVariant;
  /** Preset colors surfaced first in the color picker (e.g. theme colors). */
  colorPresets?: readonly string[];
}

function IconToggle({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label} side="bottom">
      <ToolbarButton aria-label={label} active={active} onClick={onClick}>
        {children}
      </ToolbarButton>
    </Tooltip>
  );
}

function FontStepper({
  fontSize,
  onStep,
}: {
  fontSize: number;
  onStep: (delta: number) => void;
}) {
  return (
    <div className="flex items-center">
      <IconToggle label="Decrease font size" onClick={() => onStep(-FONT_STEP)}>
        <Minus size={14} aria-hidden="true" />
      </IconToggle>
      <span className="w-8 text-center text-[11px] tabular-nums text-ds-text-secondary">
        {fontSize}
      </span>
      <IconToggle label="Increase font size" onClick={() => onStep(FONT_STEP)}>
        <Plus size={14} aria-hidden="true" />
      </IconToggle>
    </div>
  );
}

function AlignGroup({
  align,
  onChange,
  variant,
}: {
  align: ElementAlign;
  onChange: (align: ElementAlign) => void;
  variant: TextStyleBarVariant;
}) {
  return (
    <IconActionCluster bordered={variant !== "compact"}>
      {ALIGN_OPTIONS.map((option) => {
        const Icon = ALIGN_ICON[option];
        const selected = align === option;
        return (
          <Tooltip key={option} label={ALIGN_LABEL[option]} side="bottom">
            <ToolbarButton
              aria-label={ALIGN_LABEL[option]}
              active={selected}
              onClick={() => onChange(option)}
            >
              <Icon size={14} aria-hidden="true" />
            </ToolbarButton>
          </Tooltip>
        );
      })}
    </IconActionCluster>
  );
}

export function TextStyleBar({
  style,
  onChange,
  variant,
  colorPresets,
}: TextStyleBarProps) {
  const set = (patch: Partial<TextElementStyle>) =>
    onChange({ ...style, ...patch });

  const handleStep = (delta: number) =>
    set({ fontSize: stepFontSize(style.fontSize, delta) });

  const colorControl = (
    <ColorPicker
      color={style.color ?? ""}
      aria-label="Text color"
      size={variant === "compact" ? "lg" : "md"}
      presets={colorPresets}
      icon={
        variant === "compact" ? (
          <Palette size={14} aria-hidden="true" />
        ) : undefined
      }
      active={style.color !== undefined}
      triggerChrome={variant === "compact" ? "toolbar" : "swatch"}
      onChange={(hex) => set({ color: hex })}
      onReset={() => {
        const next = { ...style };
        delete next.color;
        onChange(next);
      }}
      resetLabel="Theme color"
      preserveSelection={variant === "compact"}
    />
  );

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-0.5">
        <IconToggle
          label="Bold"
          active={style.bold}
          onClick={() => set({ bold: !style.bold })}
        >
          <Bold size={14} aria-hidden="true" />
        </IconToggle>
        <IconToggle
          label="Italic"
          active={style.italic}
          onClick={() => set({ italic: !style.italic })}
        >
          <Italic size={14} aria-hidden="true" />
        </IconToggle>
        <IconToggle
          label="Underline"
          active={style.underline ?? false}
          onClick={() => set({ underline: !style.underline })}
        >
          <Underline size={14} aria-hidden="true" />
        </IconToggle>
        <AlignGroup
          align={style.align}
          onChange={(align) => set({ align })}
          variant={variant}
        />
        <span
          className="mx-0.5 h-5 w-px bg-ds-border-subtle"
          aria-hidden="true"
        />
        {colorControl}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <IconToggle
          label="Bold"
          active={style.bold}
          onClick={() => set({ bold: !style.bold })}
        >
          <Bold size={14} aria-hidden="true" />
        </IconToggle>
        <IconToggle
          label="Italic"
          active={style.italic}
          onClick={() => set({ italic: !style.italic })}
        >
          <Italic size={14} aria-hidden="true" />
        </IconToggle>
        <IconToggle
          label="Underline"
          active={style.underline ?? false}
          onClick={() => set({ underline: !style.underline })}
        >
          <Underline size={14} aria-hidden="true" />
        </IconToggle>
        <div className="ml-1">
          <AlignGroup
            align={style.align}
            onChange={(align) => set({ align })}
            variant={variant}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className={LABEL_CLASS}>Font size ({style.fontSize}%)</span>
        <FontStepper fontSize={style.fontSize} onStep={handleStep} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className={LABEL_CLASS}>Color</span>
        {colorControl}
      </div>
    </div>
  );
}
