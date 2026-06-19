"use client";

import { Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { createDocumentFromImport } from "./actions";

/** Accepted file extensions shown in the file picker. */
const ACCEPTED_EXTENSIONS = ".md,.html,.htm,.docx,.pptx,.pdf";

/**
 * Dashboard button that lets users create a new document from an imported
 * file. Uploads the file to `POST /api/import`, then calls the
 * `createDocumentFromImport` server action which creates the document and
 * redirects to the editor.
 *
 * The button is styled to match the existing `primaryButtonClass` from the
 * dashboard header so it sits alongside "New document".
 */
export function ImportDocumentButton({ className }: { className: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      setError("File too large (max 20 MB).");
      return;
    }
    setError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as
        | { markdown: string }
        | { error: string };

      if (!response.ok || "error" in data) {
        setError("error" in data ? data.error : "Import failed.");
        setIsUploading(false);
        return;
      }

      // Derive a title from the original filename (strip extension).
      const title =
        file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") ||
        "Imported document";

      startTransition(async () => {
        await createDocumentFromImport(data.markdown, title);
      });
    } catch {
      setError("Could not reach the server. Please try again.");
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
        className="sr-only"
        aria-label="Import a document file"
      />
      <button
        type="button"
        disabled={isUploading}
        onClick={() => {
          setError(null);
          inputRef.current?.click();
        }}
        className={className}
        aria-label="Import document"
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        {isUploading ? "Importing…" : "Import"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error} —{" "}
          <button
            type="button"
            onClick={() => {
              setError(null);
              inputRef.current?.click();
            }}
            className="underline"
          >
            retry
          </button>
        </p>
      )}
    </div>
  );
}
