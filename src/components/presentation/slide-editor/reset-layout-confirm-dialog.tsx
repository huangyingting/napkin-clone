"use client";

import { Dialog } from "@/components/ui/dialog";

export function ResetLayoutConfirmDialog({
  layoutName,
  onCancel,
  onConfirm,
}: {
  layoutName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open
      onClose={onCancel}
      aria-labelledby="slide-editor-reset-layout-confirm-title"
      className="max-w-sm"
    >
      <h2
        id="slide-editor-reset-layout-confirm-title"
        className="text-base font-semibold text-ds-text-primary"
      >
        Reset to &ldquo;{layoutName}&rdquo; layout?
      </h2>
      <p className="mt-2 text-sm text-ds-text-secondary">
        Slide positions will be reset. This will preserve slide content and
        element order.
      </p>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-9 items-center justify-center rounded-full border border-ds-border-strong px-4 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex h-9 items-center justify-center rounded-full bg-ds-accent px-4 text-sm font-medium text-ds-text-on-accent transition hover:opacity-90"
        >
          Reset layout
        </button>
      </div>
    </Dialog>
  );
}
