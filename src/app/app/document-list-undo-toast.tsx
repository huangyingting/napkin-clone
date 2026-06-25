import { createPortal } from "react-dom";

export function UndoToast({
  title,
  onUndo,
}: {
  title: string;
  onUndo: () => void;
}) {
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-toast flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex items-center gap-4 rounded-full border border-ds-border-strong bg-ds-text-primary px-5 py-3 text-sm text-ds-surface-base shadow-lg"
      >
        <span className="truncate">
          Document deleted
          <span className="hidden text-ds-text-secondary sm:inline">
            {" "}
            — “{title}”
          </span>
        </span>
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 rounded-full font-semibold text-ds-accent underline-offset-2 transition hover:underline"
        >
          Undo
        </button>
      </div>
    </div>,
    document.body,
  );
}
