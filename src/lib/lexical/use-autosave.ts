"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EditorState } from "lexical";

export type SaveStatus = "saved" | "pending" | "saving" | "error";

export type SaveResult = {
  ok: boolean;
  error?: string;
};

export type LexicalSaveFn = (json: string) => Promise<SaveResult>;

export const DEFAULT_SAVE_DEBOUNCE_MS = 800;

export type AutosaveController = {
  queue(json: string): void;
  flush(): Promise<void>;
  dispose(): void;
  latestJson(): string | null;
};

export function createAutosaveController({
  save,
  debounceMs,
  onStatus,
  onError,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}: {
  save: LexicalSaveFn;
  debounceMs: number;
  onStatus(status: SaveStatus): void;
  onError(error: unknown): void;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}): AutosaveController {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: string | null = null;

  const clearPendingTimer = () => {
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
  };

  const flush = async () => {
    const json = latest;
    if (json === null) {
      return;
    }
    clearPendingTimer();
    onStatus("saving");
    try {
      const result = await save(json);
      if (!result.ok) {
        onError(result.error ?? "Save failed");
        onStatus("error");
        return;
      }
      if (latest === json) {
        onStatus("saved");
      }
    } catch (error) {
      onError(error);
      onStatus("error");
    }
  };

  return {
    queue(json) {
      latest = json;
      onStatus("pending");
      clearPendingTimer();
      timer = setTimer(() => {
        void flush();
      }, debounceMs);
    },
    flush,
    dispose: clearPendingTimer,
    latestJson: () => latest,
  };
}

export function useLexicalAutosave({
  save,
  shouldAutosaveUpdate,
  debounceMs = DEFAULT_SAVE_DEBOUNCE_MS,
}: {
  save: LexicalSaveFn;
  shouldAutosaveUpdate(tags: Set<string>): boolean;
  debounceMs?: number;
}) {
  const [status, setStatus] = useState<SaveStatus>("saved");

  const controller = useMemo(
    () =>
      createAutosaveController({
        save,
        debounceMs,
        onStatus: setStatus,
        onError: (error) => console.error(error),
      }),
    [save, debounceMs],
  );

  useEffect(() => {
    return () => controller.dispose();
  }, [controller]);

  const handleChange = useCallback(
    (editorState: EditorState, _editor: unknown, tags: Set<string>) => {
      if (!shouldAutosaveUpdate(tags)) {
        return;
      }
      controller.queue(JSON.stringify(editorState.toJSON()));
    },
    [controller, shouldAutosaveUpdate],
  );

  return { status, handleChange };
}
