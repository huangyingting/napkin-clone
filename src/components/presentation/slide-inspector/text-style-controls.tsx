"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Minus,
  Plus,
  Underline,
} from "lucide-react";

import { ColorPicker, Tabs } from "@/components/ui";
import { FOCUS_RING } from "@/components/ui/tokens";
import { PropRow } from "@/components/presentation/slide-inspector/primitives";
import type { TextElementStyle } from "@/lib/presentation/deck";
import {
  FONT_MAX,
  FONT_MIN,
  FONT_STEP,
  stepFontSize,
} from "@/lib/presentation/text-style";

export type TextInspectorTab = "style" | "paragraph" | "content";

export function TextInspectorTabs({
  activeTab,
  onChange,
}: {
  activeTab: TextInspectorTab;
  onChange: (tab: TextInspectorTab) => void;
}) {
  const tabs = [
    { value: "style" as const, label: "Style" },
    { value: "paragraph" as const, label: "Paragraph" },
    { value: "content" as const, label: "Content" },
  ];
  return (
    <Tabs
      aria-label="Text settings"
      options={tabs}
      value={activeTab}
      onChange={onChange}
    />
  );
}

export function TextPanelCardHeader({
  title,
  resetLabel,
  onReset,
}: {
  title?: string;
  resetLabel?: string;
  onReset?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      {title ? (
        <span className="text-xs font-semibold text-ds-text-primary">
          {title}
        </span>
      ) : null}
      {onReset && resetLabel ? (
        <button
          type="button"
          onClick={onReset}
          className={`rounded-full bg-ds-accent-surface px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ds-accent-text ring-1 ring-ds-accent-border transition-colors hover:bg-ds-accent hover:text-ds-text-on-accent ${FOCUS_RING}`}
        >
          {resetLabel}
        </button>
      ) : null}
    </div>
  );
}

export function TextEmphasisControl({
  style,
  onChange,
}: {
  style: TextElementStyle;
  onChange: (style: TextElementStyle) => void;
}) {
  const buttonClass = (active: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${
      active ? "bg-ds-surface-base text-ds-accent-text shadow-ds-raised" : ""
    } ${FOCUS_RING}`;
  return (
    <PropRow label="Emphasis">
      <div className="flex rounded-ds-md bg-ds-surface p-0.5 ring-1 ring-ds-border-subtle">
        <button
          type="button"
          aria-label="Bold"
          aria-pressed={style.bold}
          onClick={() => onChange({ ...style, bold: !style.bold })}
          className={buttonClass(style.bold)}
        >
          <Bold size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Italic"
          aria-pressed={style.italic}
          onClick={() => onChange({ ...style, italic: !style.italic })}
          className={buttonClass(style.italic)}
        >
          <Italic size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Underline"
          aria-pressed={style.underline === true}
          onClick={() =>
            onChange({
              ...style,
              underline: style.underline === true ? undefined : true,
            })
          }
          className={buttonClass(style.underline === true)}
        >
          <Underline size={14} aria-hidden="true" />
        </button>
      </div>
    </PropRow>
  );
}

export function HorizontalAlignControl({
  style,
  onChange,
}: {
  style: TextElementStyle;
  onChange: (style: TextElementStyle) => void;
}) {
  const active = style.align ?? "left";
  const options = [
    { value: "left" as const, label: "Align left", icon: AlignLeft },
    { value: "center" as const, label: "Align center", icon: AlignCenter },
    { value: "right" as const, label: "Align right", icon: AlignRight },
  ];
  return (
    <PropRow label="Align">
      <div className="flex rounded-ds-md bg-ds-surface p-0.5 ring-1 ring-ds-border-subtle">
        {options.map(({ value, label, icon: Icon }) => {
          const selected = active === value;
          return (
            <button
              key={value}
              type="button"
              aria-label={label}
              aria-pressed={selected}
              onClick={() => onChange({ ...style, align: value })}
              className={`flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${
                selected
                  ? "bg-ds-surface-base text-ds-accent-text shadow-ds-raised"
                  : ""
              } ${FOCUS_RING}`}
            >
              <Icon size={14} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </PropRow>
  );
}

export function TextSizeColorControl({
  style,
  inheritedColor,
  onChange,
}: {
  style: TextElementStyle;
  inheritedColor: string;
  onChange: (style: TextElementStyle) => void;
}) {
  const value = style.color ?? inheritedColor;
  const setSize = (next: number) => onChange({ ...style, fontSize: next });
  const stepButtonClass =
    "flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="block">
        <span className="mb-1 block text-xs font-medium text-ds-text-secondary">
          Size
        </span>
        <div className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center rounded-ds-md bg-ds-surface p-0.5 ring-1 ring-ds-border-subtle">
          <button
            type="button"
            aria-label="Decrease font size"
            disabled={style.fontSize <= FONT_MIN}
            onClick={() => setSize(stepFontSize(style.fontSize, -FONT_STEP))}
            className={`${stepButtonClass} ${FOCUS_RING}`}
          >
            <Minus size={13} aria-hidden="true" />
          </button>
          <span className="text-center text-[11px] font-semibold tabular-nums text-ds-text-secondary">
            {style.fontSize}
          </span>
          <button
            type="button"
            aria-label="Increase font size"
            disabled={style.fontSize >= FONT_MAX}
            onClick={() => setSize(stepFontSize(style.fontSize, FONT_STEP))}
            className={`${stepButtonClass} ${FOCUS_RING}`}
          >
            <Plus size={13} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="block">
        <span className="mb-1 block text-xs font-medium text-ds-text-secondary">
          Color
        </span>
        <div className="flex h-8 items-center rounded-ds-md bg-ds-surface px-1.5 ring-1 ring-ds-border-subtle">
          <ColorPicker
            color={value}
            fallback="#000000"
            aria-label="Text color"
            layer="tooltip"
            onChange={(hex) => onChange({ ...style, color: hex })}
          />
          <span className="ml-2 truncate font-mono text-[11px] tabular-nums text-ds-text-secondary">
            {value.toLowerCase()}
          </span>
        </div>
      </div>
    </div>
  );
}
