"use client";

import { FOCUS_RING } from "@/components/ui/tokens";
import { useCoalesceSession } from "@/lib/presentation/gesture-primitives";

const FIELD_CLASS =
  "w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-sm text-ds-text-primary outline-none";
const LABEL_CLASS = "mb-1 block text-xs font-medium text-ds-text-secondary";

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
