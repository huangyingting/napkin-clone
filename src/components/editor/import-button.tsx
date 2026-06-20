"use client";

import { Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

/** Accepted file extensions shown in the file picker and error messages. */
const ACCEPTED_EXTENSIONS = ".md,.html,.htm,.docx,.pptx,.pdf";

/** Human-readable list of accepted formats. */
const ACCEPTED_LABEL = ".md, .html, .docx, .pptx, .pdf";

type ImportState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "error"; message: string };

/**
 * A drag-and-drop + file-picker button that uploads a document to
 * `POST /api/import` and calls `onImport` with the extracted Markdown text.
 *
 * - Validates file type/size before uploading (a server-side re-check still
 *   happens in the route handler).
 * - Shows a retryable error state on failure.
 * - Uses `--ds-*` design tokens for all colors and spacing so it adapts to
 *   light/dark automatically.
 */
export function ImportButton({
  onImport,
  label = "Import document",
  compact = false,
}: {
  /** Called with the extracted Markdown text when parsing succeeds. */
  onImport: (markdown: string) => void;
  /** Button label text. */
  label?: string;
  /** When true, renders a smaller inline button instead of the drop-zone card. */
  compact?: boolean;
}) {
  const [state, setState] = useState<ImportState>({ status: "idle" });
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      // Client-side size guard (20 MB).
      if (file.size > 20 * 1024 * 1024) {
        setState({
          status: "error",
          message: "File is too large. Maximum allowed size is 20 MB.",
        });
        return;
      }

      setState({ status: "uploading" });

      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch("/api/import", {
          method: "POST",
          body: formData,
        });

        const data = (await response.json()) as
          | { markdown: string }
          | { error: string };

        if (!response.ok || "error" in data) {
          setState({
            status: "error",
            message: "error" in data ? data.error : "Import failed.",
          });
          return;
        }

        setState({ status: "idle" });
        onImport(data.markdown);
      } catch {
        setState({
          status: "error",
          message: "Could not reach the server. Please try again.",
        });
      }
    },
    [onImport],
  );

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void processFile(file);
    }
    // Reset so the same file can be re-picked after an error.
    event.target.value = "";
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const dismiss = () => setState({ status: "idle" });

  const isUploading = state.status === "uploading";

  if (compact) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileChange}
          className="sr-only"
          aria-label="Import document file"
        />
        {state.status === "error" ? (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-[var(--ds-radius-md,10px)] border border-ds-danger-border bg-ds-danger-surface px-3 py-2 text-xs text-ds-danger-text"
          >
            <span className="flex-1">{state.message}</span>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={dismiss}
              className="shrink-0 rounded-full p-0.5 hover:bg-ds-state-hover"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
            className="flex h-8 items-center gap-1.5 rounded-[var(--ds-radius-pill,9999px)] border border-[var(--ds-border-subtle,rgba(0,0,0,0.06))] bg-[var(--ds-surface-base,#fff)] px-3 text-xs font-medium text-[var(--ds-text-secondary,#52525b)] transition hover:bg-[var(--ds-surface-raised,#f4f4f5)] hover:text-[var(--ds-text-primary,#18181b)] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={label}
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {isUploading ? "Importing…" : label}
          </button>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        onChange={handleFileChange}
        className="sr-only"
        aria-label="Import document file"
      />

      {state.status === "error" ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-[var(--ds-radius-lg,14px)] border border-ds-danger-border bg-ds-danger-surface p-4 text-sm text-ds-danger-text"
        >
          <span className="flex-1">{state.message}</span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-full border border-ds-danger-border px-3 py-1 text-xs font-medium transition hover:bg-ds-state-hover"
            >
              Try again
            </button>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={dismiss}
              className="rounded-full p-1 hover:bg-ds-state-hover"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          role="button"
          tabIndex={0}
          aria-label={`${label} — drag and drop or click to browse`}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[var(--ds-radius-xl,18px)] border-2 border-dashed px-6 py-8 text-center transition-colors ${
            isDragging
              ? "border-[var(--ds-accent,#6366f1)] bg-[var(--ds-accent,#6366f1)]/5"
              : "border-[var(--ds-border-subtle,rgba(0,0,0,0.1))] hover:border-[var(--ds-border-strong,rgba(0,0,0,0.15))] hover:bg-[var(--ds-surface-sunken,#f9f9f9)]"
          } ${isUploading ? "cursor-not-allowed opacity-60" : ""}`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] bg-[var(--ds-surface-raised,#f4f4f5)]">
            <Upload
              className="h-5 w-5 text-[var(--ds-text-secondary,#52525b)]"
              aria-hidden="true"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-[var(--ds-text-primary,#18181b)]">
              {isUploading ? "Importing…" : "Drop a file or click to browse"}
            </span>
            <span className="text-xs text-[var(--ds-text-muted,#a1a1aa)]">
              {ACCEPTED_LABEL} · max 20 MB
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
