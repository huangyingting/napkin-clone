"use client";

import { useCallback, useRef } from "react";

/**
 * Returns a stable `nextKey(prefix, id)` function that generates a unique
 * coalesce key for each drag/resize/edit gesture on the presentation stage.
 *
 * Each call to the returned function increments a monotonic counter so
 * consecutive gestures of the same kind on the same element produce distinct
 * keys and therefore land in separate undo steps (issue #242).
 */
export function useGestureKey() {
  const seqRef = useRef(0);
  return useCallback((prefix: string, id: string) => {
    seqRef.current += 1;
    return `${prefix}:${id}#${seqRef.current}`;
  }, []);
}

/**
 * Manages the coalesce key for a single-field editing session (focus → blur).
 *
 * While the field is focused every onChange call receives the same key, so
 * the whole typing run collapses into one undo step (issue #306). The key is
 * cleared on blur so the next focus starts a fresh step.
 *
 * Usage:
 * ```tsx
 * const { coalesceKeyRef, onSessionStart, onSessionEnd } =
 *   useCoalesceSession("notes-edit");
 *
 * <textarea
 *   onFocus={onSessionStart}
 *   onBlur={onSessionEnd}
 *   onChange={(e) => onChange(e.target.value, coalesceKeyRef.current ?? undefined)}
 * />
 * ```
 */
export function useCoalesceSession(prefix: string) {
  const seqRef = useRef(0);
  const coalesceKeyRef = useRef<string | null>(null);

  const onSessionStart = useCallback(() => {
    seqRef.current += 1;
    coalesceKeyRef.current = `${prefix}:${seqRef.current}`;
  }, [prefix]);

  const onSessionEnd = useCallback(() => {
    coalesceKeyRef.current = null;
  }, []);

  return { coalesceKeyRef, onSessionStart, onSessionEnd };
}
