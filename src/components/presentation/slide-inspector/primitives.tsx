"use client";

import { FOCUS_RING } from "@/components/ui/tokens";
import type {
  BulletItem,
  BulletsElement,
  TextElementStyle,
  TextFitMode,
} from "@/lib/presentation/deck";
import { normalizeBulletItems } from "@/lib/presentation/deck";
import { useCoalesceSession } from "@/lib/presentation/gesture-primitives";
import { SLIDE_FONT_OPTIONS } from "@/lib/presentation/slide-fonts";

const FIELD_CLASS =
  "w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-sm text-ds-text-primary outline-none";
const LABEL_CLASS = "mb-1 block text-xs font-medium text-ds-text-secondary";

/**
 * Selectable slide fonts for text/bullets elements. Each `value` is a stable
 * slide `fontId` from the self-hosted registry; the empty value inherits the
 * theme/role font.
 */
const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: "Default", value: "" },
  ...SLIDE_FONT_OPTIONS.map((font) => ({
    label: font.label,
    value: font.id,
  })),
];

export { FIELD_CLASS, LABEL_CLASS, FONT_FAMILIES };

export function TabButton({
  active,
  tabId,
  panelId,
  label,
  onClick,
  onKeyDown,
}: {
  active: boolean;
  tabId: string;
  panelId: string;
  label: string;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={tabId}
      aria-selected={active}
      aria-controls={panelId}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`flex-1 rounded-ds-sm px-2 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-ds-accent-surface text-ds-accent-text"
          : "text-ds-text-secondary hover:bg-ds-state-hover"
      } ${FOCUS_RING}`}
    >
      {label}
    </button>
  );
}

export function SpeakerNotesControl({
  notes,
  onChange,
}: {
  notes: string;
  onChange: (value: string, coalesceKey?: string) => void;
}) {
  const { coalesceKeyRef, onSessionStart, onSessionEnd } =
    useCoalesceSession("notes-edit");

  return (
    <label className="block">
      <span className={LABEL_CLASS}>Speaker notes</span>
      <textarea
        value={notes}
        onChange={(event) =>
          onChange(event.target.value, coalesceKeyRef.current ?? undefined)
        }
        onFocus={onSessionStart}
        onBlur={onSessionEnd}
        rows={12}
        aria-label="Speaker notes"
        placeholder="Add speaker notes…"
        className={`${FIELD_CLASS} min-h-64 resize-y leading-6 placeholder:text-ds-text-muted ${FOCUS_RING}`}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Fit mode picker (text / bullets elements)
// ---------------------------------------------------------------------------

export const FIT_MODE_OPTIONS: {
  value: TextFitMode;
  label: string;
  title: string;
}[] = [
  {
    value: "auto-height",
    label: "Auto",
    title: "Box grows to fit content (default)",
  },
  {
    value: "fixed-box",
    label: "Clip",
    title: "Box height is fixed; overflow is clipped",
  },
  {
    value: "shrink-to-fit",
    label: "Shrink",
    title: "Font shrinks until content fits the box",
  },
];

export function FitModeControl({
  fitMode,
  onChange,
}: {
  fitMode: TextFitMode | undefined;
  onChange: (mode: TextFitMode | undefined) => void;
}) {
  const active = fitMode ?? "auto-height";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={LABEL_CLASS + " mb-0"}>Text fit</span>
      <div
        role="radiogroup"
        aria-label="Text fit mode"
        className="flex gap-0.5"
      >
        {FIT_MODE_OPTIONS.map(({ value, label, title }) => {
          const isActive = active === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isActive}
              title={title}
              onClick={() =>
                // Selecting the default "auto-height" clears the field
                onChange(value === "auto-height" ? undefined : value)
              }
              className={`rounded-ds-sm px-2 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-ds-accent-surface text-ds-accent-text"
                  : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
              } ${FOCUS_RING}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vertical align control
// ---------------------------------------------------------------------------

type VerticalAlignValue = "top" | "middle" | "bottom";

export const VERTICAL_ALIGN_OPTIONS: {
  value: VerticalAlignValue;
  label: string;
  title: string;
}[] = [
  { value: "top", label: "Top", title: "Align text to top" },
  { value: "middle", label: "Mid", title: "Center text vertically (default)" },
  { value: "bottom", label: "Bot", title: "Align text to bottom" },
];

export function VerticalAlignControl({
  style,
  onChange,
}: {
  style: TextElementStyle;
  onChange: (style: TextElementStyle) => void;
}) {
  const active: VerticalAlignValue = style.verticalAlign ?? "middle";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={LABEL_CLASS + " mb-0"}>V-align</span>
      <div
        role="radiogroup"
        aria-label="Vertical text alignment"
        className="flex gap-0.5"
      >
        {VERTICAL_ALIGN_OPTIONS.map(({ value, label, title }) => {
          const isActive = active === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isActive}
              title={title}
              onClick={() =>
                onChange({
                  ...style,
                  // "middle" is the default — clear the field to keep the model lean
                  ...(value === "middle"
                    ? { verticalAlign: undefined }
                    : { verticalAlign: value }),
                })
              }
              className={`rounded-ds-sm px-2 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-ds-accent-surface text-ds-accent-text"
                  : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
              } ${FOCUS_RING}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Line height control
// ---------------------------------------------------------------------------

export const LINE_HEIGHT_OPTIONS: { value: number; label: string }[] = [
  { value: 1.0, label: "1.0" },
  { value: 1.2, label: "1.2" },
  { value: 1.5, label: "1.5" },
  { value: 2.0, label: "2.0" },
];

export function LineHeightControl({
  style,
  onChange,
}: {
  style: TextElementStyle;
  onChange: (style: TextElementStyle) => void;
}) {
  const active = style.lineHeight ?? 1.2;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={LABEL_CLASS + " mb-0"}>Line height</span>
      <div role="radiogroup" aria-label="Line height" className="flex gap-0.5">
        {LINE_HEIGHT_OPTIONS.map(({ value, label }) => {
          const isActive = Math.abs(active - value) < 0.001;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isActive}
              title={`Line height ${label}`}
              onClick={() =>
                onChange({
                  ...style,
                  // 1.2 is the default — clear to keep model lean
                  ...(Math.abs(value - 1.2) < 0.001
                    ? { lineHeight: undefined }
                    : { lineHeight: value }),
                })
              }
              className={`rounded-ds-sm px-2 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-ds-accent-surface text-ds-accent-text"
                  : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
              } ${FOCUS_RING}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paragraph spacing control (text elements)
// ---------------------------------------------------------------------------

export function ParagraphSpacingControl({
  style,
  onChange,
}: {
  style: TextElementStyle;
  onChange: (style: TextElementStyle) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className={LABEL_CLASS + " mb-0"}>Para spacing</span>
      <input
        type="number"
        min={0}
        max={20}
        step={0.5}
        value={style.paragraphSpacing ?? 0}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          const next = { ...style };
          if (!Number.isFinite(v) || v <= 0) {
            delete next.paragraphSpacing;
          } else {
            next.paragraphSpacing = v;
          }
          onChange(next);
        }}
        className={`w-16 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1 text-right text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Bullets-specific: bulletGap and bulletIndent
// ---------------------------------------------------------------------------

export function BulletGapControl({
  element,
  onChange,
}: {
  element: BulletsElement;
  onChange: (patch: Partial<BulletsElement>) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className={LABEL_CLASS + " mb-0"}>Bullet gap</span>
      <input
        type="number"
        min={0}
        max={20}
        step={0.5}
        value={element.bulletGap ?? 0}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isFinite(v) || v <= 0) {
            onChange({ bulletGap: undefined });
          } else {
            onChange({ bulletGap: v });
          }
        }}
        className={`w-16 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1 text-right text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
      />
    </label>
  );
}

export function BulletIndentControl({
  element,
  onChange,
}: {
  element: BulletsElement;
  onChange: (patch: Partial<BulletsElement>) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className={LABEL_CLASS + " mb-0"}>Bullet indent</span>
      <input
        type="number"
        min={0}
        max={30}
        step={1}
        value={element.bulletIndent ?? 0}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isFinite(v) || v <= 0) {
            onChange({ bulletIndent: undefined });
          } else {
            onChange({ bulletIndent: v });
          }
        }}
        className={`w-16 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1 text-right text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
      />
    </label>
  );
}

/**
 * List-type toggle: switches all items in the list between bullet and numbered.
 * Per-item list type is set via Tab/Shift+Tab in the inline editor.
 */
export function ListTypeControl({
  element,
  onChange,
}: {
  element: BulletsElement;
  onChange: (patch: Partial<BulletsElement>) => void;
}) {
  const items = normalizeBulletItems(element);
  // Consider the list "numbered" if a majority of items are numbered.
  const numberedCount = items.filter(
    (it: BulletItem) => it.listType === "number",
  ).length;
  const isNumbered = items.length > 0 && numberedCount > items.length / 2;

  function toggle() {
    const targetType = isNumbered ? "bullet" : "number";
    const newItems: BulletItem[] = items.map((it: BulletItem) => ({
      ...it,
      listType: targetType,
    }));
    onChange({ items: newItems });
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className={LABEL_CLASS + " mb-0"}>List type</span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => !isNumbered || toggle()}
          className={`rounded-ds-md border px-2 py-1 text-xs transition-colors ${
            !isNumbered
              ? "border-ds-accent-border bg-ds-accent-surface text-ds-accent-text"
              : "border-ds-border-subtle bg-ds-surface text-ds-text-primary hover:bg-ds-state-hover"
          } ${FOCUS_RING}`}
          aria-pressed={!isNumbered}
          title="Bullet list"
        >
          • Bullet
        </button>
        <button
          type="button"
          onClick={() => isNumbered || toggle()}
          className={`rounded-ds-md border px-2 py-1 text-xs transition-colors ${
            isNumbered
              ? "border-ds-accent-border bg-ds-accent-surface text-ds-accent-text"
              : "border-ds-border-subtle bg-ds-surface text-ds-text-primary hover:bg-ds-state-hover"
          } ${FOCUS_RING}`}
          aria-pressed={isNumbered}
          title="Numbered list"
        >
          1. Number
        </button>
      </div>
    </div>
  );
}

/**
 * Numeric box field (percent units). Commits clamped values to the element box.
 */
export function NumberField({
  label,
  value,
  min = 0,
  max = 100,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-ds-text-muted">{label}</span>
      <input
        type="number"
        value={Math.round(value * 10) / 10}
        min={min}
        max={max}
        step={1}
        onChange={(event) => {
          const n = Number(event.target.value);
          if (Number.isFinite(n)) {
            onCommit(Math.max(min, Math.min(max, n)));
          }
        }}
        className={`w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1 text-sm text-ds-text-primary outline-none ${FOCUS_RING}`}
      />
    </label>
  );
}
