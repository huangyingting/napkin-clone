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
  let generation = 0;
  let disposed = false;
  let inFlight: Promise<void> | null = null;
  let flushAgain = false;

  const clearPendingTimer = () => {
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
  };

  const emitStatus = (status: SaveStatus) => {
    if (!disposed) onStatus(status);
  };

  const emitError = (error: unknown) => {
    if (!disposed) onError(error);
  };

  const flush = async (): Promise<void> => {
    const json = latest;
    if (disposed || json === null) {
      return;
    }
    if (inFlight) {
      flushAgain = true;
      return inFlight;
    }
    clearPendingTimer();
    const saveGeneration = generation;
    emitStatus("saving");
    inFlight = (async () => {
      try {
        const result = await save(json);
        if (disposed || saveGeneration !== generation || latest !== json) {
          return;
        }
        if (!result.ok) {
          emitError(result.error ?? "Save failed");
          emitStatus("error");
          return;
        }
        emitStatus("saved");
      } catch (error) {
        if (disposed || saveGeneration !== generation || latest !== json) {
          return;
        }
        emitError(error);
        emitStatus("error");
      } finally {
        inFlight = null;
        if (!disposed && flushAgain && latest !== json) {
          flushAgain = false;
          await flush();
        } else {
          flushAgain = false;
        }
      }
    })();
    return inFlight;
  };

  return {
    queue(json) {
      if (disposed) return;
      latest = json;
      generation += 1;
      if (inFlight) {
        flushAgain = true;
      }
      emitStatus("pending");
      clearPendingTimer();
      timer = setTimer(() => {
        void flush();
      }, debounceMs);
    },
    flush,
    dispose() {
      disposed = true;
      clearPendingTimer();
    },
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
