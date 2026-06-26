"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";

import type { SlideInspectorProps } from "./types";
import {
  BulletGapControl,
  BulletIndentControl,
  FIELD_CLASS,
  FitModeControl,
  FONT_FAMILIES,
  LABEL_CLASS,
  LineHeightControl,
  ListTypeControl,
  ParagraphSpacingControl,
  TabButton,
  VerticalAlignControl,
} from "./primitives";
import { FOCUS_RING } from "@/components/ui/tokens";
import { ColorPicker } from "@/components/ui/color-picker";
import type {
  Deck,
  Slide,
  SlideElement,
  TextElementStyle,
} from "@/lib/presentation/deck";
import {
  resolveRoleToken,
  type DeckTextRole,
} from "@/lib/presentation/deck-theme-tokens";
import { matchSlideFont } from "@/lib/presentation/slide-fonts";
import { resolveSlideTokenSet } from "@/lib/presentation/style-cascade";
import {
  FONT_MAX,
  FONT_MIN,
  FONT_STEP,
  stepFontSize,
} from "@/lib/presentation/text-style";

const DEFAULT_SHAPE_TEXT_STYLE: TextElementStyle = {
  fontSize: 4,
  bold: false,
  italic: false,
  align: "center",
};

/** Hex color test used by the inheritance-aware color control. */
function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Semantic roles offered per element kind in the Text panel (#615). */
export const TEXT_ROLE_OPTIONS: Readonly<
  Record<
    "text" | "bullets" | "shape",
    ReadonlyArray<{ value: DeckTextRole; label: string }>
  >
> = {
  text: [
    { value: "h1", label: "Heading 1" },
    { value: "h2", label: "Heading 2" },
    { value: "h3", label: "Heading 3" },
    { value: "subtitle", label: "Subtitle" },
    { value: "body", label: "Body" },
    { value: "caption", label: "Caption" },
  ],
  bullets: [
    { value: "bullet", label: "Bullet" },
    { value: "body", label: "Body" },
  ],
  shape: [
    { value: "shapeLabel", label: "Shape label" },
    { value: "h1", label: "Heading 1" },
    { value: "h2", label: "Heading 2" },
    { value: "h3", label: "Heading 3" },
    { value: "body", label: "Body" },
    { value: "caption", label: "Caption" },
  ],
};

/** The role an element inherits when it carries no explicit `textRole`. */
function defaultTextRole(element: SlideElement): DeckTextRole {
  if (element.kind === "text") return element.role === "title" ? "h1" : "body";
  if (element.kind === "bullets") return "bullet";
  return "shapeLabel";
}

/** Elements that carry a semantic text role + local style override (#615). */
type TextBearingElement = Extract<
  SlideElement,
  { kind: "text" | "bullets" | "shape" }
>;

/** Role dropdown: switches the element's semantic typography role (#615). */
export function RoleSelectControl({
  element,
  onChange,
}: {
  element: TextBearingElement;
  onChange: (role: DeckTextRole) => void;
}) {
  const kindKey =
    element.kind === "shape" ? "shape" : (element.kind as "text" | "bullets");
  const options = TEXT_ROLE_OPTIONS[kindKey];
  const current = element.textRole ?? defaultTextRole(element);
  return (
    <label className="block">
      <span className={LABEL_CLASS}>Role</span>
      <select
        value={current}
        onChange={(event) => onChange(event.target.value as DeckTextRole)}
        className={`${FIELD_CLASS} ${FOCUS_RING}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-[11px] text-ds-text-muted">
        Inherits theme typography for this role; edits below override it
        locally.
      </span>
    </label>
  );
}

/**
 * Header row marking a property as inherited or locally overridden, with a
 * per-property reset to the inherited theme value (#615).
 */
export function OverrideHeader({
  label,
  overridden,
  onReset,
}: {
  label: string;
  overridden: boolean;
  onReset: () => void;
}) {
  return (
    <span className="mb-1 flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-ds-text-secondary">
        {label}
      </span>
      {overridden ? (
        <span className="flex items-center gap-1.5">
          <span className="rounded-ds-sm bg-ds-state-hover px-1 py-0.5 text-[10px] font-medium text-ds-text-secondary">
            Custom
          </span>
          <button
            type="button"
            onClick={onReset}
            className={`rounded-ds-sm text-[11px] text-ds-text-secondary underline-offset-2 hover:underline ${FOCUS_RING}`}
          >
            Reset
          </button>
        </span>
      ) : (
        <span className="text-[10px] text-ds-text-muted">Inherited</span>
      )}
    </span>
  );
}

/**
 * Font-size stepper. The right Text panel owns precise typography size, so it
 * is intentionally absent from the on-canvas context toolbar (#651, #635).
 * Size is a percent of slide height, snapped to FONT_STEP and clamped to
 * [FONT_MIN, FONT_MAX].
 */
export function FontSizeControl({
  style,
  onChange,
}: {
  style: TextElementStyle;
  onChange: (style: TextElementStyle) => void;
}) {
  const size = style.fontSize;
  const setSize = (next: number) => onChange({ ...style, fontSize: next });
  const btnClass = `flex h-7 w-7 items-center justify-center rounded-ds-sm border border-ds-border-subtle text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`;
  return (
    <div className="block">
      <span className={LABEL_CLASS}>Size</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Decrease font size"
          disabled={size <= FONT_MIN}
          onClick={() => setSize(stepFontSize(size, -FONT_STEP))}
          className={btnClass}
        >
          <Minus size={14} aria-hidden="true" />
        </button>
        <input
          type="number"
          min={FONT_MIN}
          max={FONT_MAX}
          step={FONT_STEP}
          value={size}
          aria-label="Font size"
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) setSize(stepFontSize(next, 0));
          }}
          className={`w-16 text-center ${FIELD_CLASS} ${FOCUS_RING}`}
        />
        <button
          type="button"
          aria-label="Increase font size"
          disabled={size >= FONT_MAX}
          onClick={() => setSize(stepFontSize(size, FONT_STEP))}
          className={btnClass}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Font control that surfaces inherited vs. local state with reset (#615). */
export function InheritedFontControl({
  style,
  inheritedLabel,
  onChange,
}: {
  style: TextElementStyle;
  inheritedLabel: string;
  onChange: (style: TextElementStyle) => void;
}) {
  const overridden = style.fontId !== undefined;
  return (
    <div className="block">
      <OverrideHeader
        label="Font"
        overridden={overridden}
        onReset={() => {
          const next = { ...style };
          delete next.fontId;
          onChange(next);
        }}
      />
      <select
        value={style.fontId ?? ""}
        aria-label="Font family"
        onChange={(event) => {
          const value = event.target.value;
          const next = { ...style };
          if (value) next.fontId = value;
          else delete next.fontId;
          onChange(next);
        }}
        className={`${FIELD_CLASS} ${FOCUS_RING}`}
      >
        <option value="">Theme default ({inheritedLabel})</option>
        {FONT_FAMILIES.filter((font) => font.value).map((font) => (
          <option key={font.label} value={font.value}>
            {font.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Color control that surfaces inherited vs. local state with reset (#615). */
export function InheritedColorControl({
  style,
  inheritedColor,
  onChange,
}: {
  style: TextElementStyle;
  inheritedColor: string;
  onChange: (style: TextElementStyle) => void;
}) {
  const overridden = style.color !== undefined;
  const value = style.color ?? inheritedColor;
  const setColor = (hex: string) => onChange({ ...style, color: hex });
  return (
    <div className="block">
      <OverrideHeader
        label="Color"
        overridden={overridden}
        onReset={() => {
          const next = { ...style };
          delete next.color;
          onChange(next);
        }}
      />
      <div className="flex items-center gap-2">
        <ColorPicker
          color={isHexColor(value) ? value : "#000000"}
          onChange={setColor}
          aria-label="Text color"
        />
        <input
          key={value}
          type="text"
          spellCheck={false}
          defaultValue={value}
          aria-label="Text color hex"
          onBlur={(event) => {
            const next = event.target.value.trim();
            if (isHexColor(next) && next.toLowerCase() !== value.toLowerCase())
              setColor(next);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter")
              (event.target as HTMLInputElement).blur();
          }}
          className={`w-24 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-1.5 py-1 font-mono text-[11px] text-ds-text-primary ${FOCUS_RING}`}
        />
      </div>
    </div>
  );
}

export function TextPanel({
  element,
  deck,
  slide,
  onUpdateElement,
}: {
  element: SlideElement | null;
  deck: Deck;
  slide: Slide;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const [textTab, setTextTab] = useState<"font" | "style">("font");

  if (!element) {
    return (
      <p className="text-xs text-ds-text-muted">
        Select a text-bearing element to edit typography.
      </p>
    );
  }

  if (
    element.kind !== "text" &&
    element.kind !== "bullets" &&
    !(element.kind === "shape" && element.shape !== "line")
  ) {
    return (
      <p className="text-xs text-ds-text-muted">
        Text settings are available for text, bullets, and labeled shapes.
      </p>
    );
  }

  const style =
    element.kind === "shape"
      ? (element.textStyle ?? DEFAULT_SHAPE_TEXT_STYLE)
      : element.style;
  const updateStyle = (next: TextElementStyle) => {
    if (element.kind === "shape") {
      onUpdateElement(element.id, { textStyle: next });
      return;
    }
    onUpdateElement(element.id, { style: next });
  };

  // Resolve the inherited (role-token) values so the panel can show what the
  // element falls back to and mark per-property local overrides (#615).
  const role = element.textRole ?? defaultTextRole(element);
  const tokenSet = resolveSlideTokenSet(deck, slide);
  const roleToken = resolveRoleToken(tokenSet, role);
  const inheritedColor = roleToken.color;
  const inheritedFontLabel =
    matchSlideFont(roleToken.fontFamily ?? tokenSet.typography.fontFamily)
      ?.label ?? "theme font";

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Text settings tabs"
        className="flex items-center gap-1 rounded-ds-md bg-ds-surface-raised p-1"
      >
        <TabButton
          active={textTab === "font"}
          tabId="text-panel-tab-font"
          panelId="text-panel-font"
          label="Font"
          onClick={() => setTextTab("font")}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              setTextTab((current) => (current === "font" ? "style" : "font"));
            }
          }}
        />
        <TabButton
          active={textTab === "style"}
          tabId="text-panel-tab-style"
          panelId="text-panel-style"
          label="Style"
          onClick={() => setTextTab("style")}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              setTextTab((current) => (current === "font" ? "style" : "font"));
            }
          }}
        />
      </div>

      {textTab === "font" ? (
        <div
          role="tabpanel"
          id="text-panel-font"
          aria-labelledby="text-panel-tab-font"
          className="flex flex-col gap-3"
        >
          <RoleSelectControl
            element={element}
            onChange={(textRole) => onUpdateElement(element.id, { textRole })}
          />
          <InheritedColorControl
            style={style}
            inheritedColor={inheritedColor}
            onChange={updateStyle}
          />
          <InheritedFontControl
            style={style}
            inheritedLabel={inheritedFontLabel}
            onChange={updateStyle}
          />
          <FontSizeControl style={style} onChange={updateStyle} />
          <LineHeightControl style={style} onChange={updateStyle} />
          {element.kind === "text" || element.kind === "shape" ? (
            <ParagraphSpacingControl style={style} onChange={updateStyle} />
          ) : null}
          {element.kind === "bullets" ? (
            <BulletGapControl
              element={element}
              onChange={(patch) => onUpdateElement(element.id, patch)}
            />
          ) : null}
        </div>
      ) : null}

      {textTab === "style" ? (
        <div
          role="tabpanel"
          id="text-panel-style"
          aria-labelledby="text-panel-tab-style"
          className="flex flex-col gap-3"
        >
          {element.kind === "text" || element.kind === "bullets" ? (
            <FitModeControl
              fitMode={element.fitMode}
              onChange={(fitMode) => onUpdateElement(element.id, { fitMode })}
            />
          ) : null}
          <VerticalAlignControl style={style} onChange={updateStyle} />
          {element.kind === "bullets" ? (
            <>
              <BulletIndentControl
                element={element}
                onChange={(patch) => onUpdateElement(element.id, patch)}
              />
              <ListTypeControl
                element={element}
                onChange={(patch) => onUpdateElement(element.id, patch)}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
