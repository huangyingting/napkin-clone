"use client";

import { useEffect, useReducer, useRef } from "react";

import { ETA_HINT, getStageLabel } from "./generation-stages";

/**
 * Module-level session flag: flips to `true` after the first generation
 * in this browser session.  Resets on page reload; does NOT require
 * sessionStorage so it works in SSR/streaming environments (this file is
 * "use client" anyway, so it only ever runs in the browser).
 */
let _hasGeneratedThisSession = false;

export type GenerationStatusResult = {
  /** Current descriptive stage label (e.g., "Analysing text…") */
  stageLabel: string;
  /** True only for the very first generation of the session. */
  showEta: boolean;
  /** ETA hint string, e.g., "~10–15 s" */
  etaHint: string;
};

type State = { stageLabel: string; showEta: boolean };
type Action =
  | { type: "start"; isFirst: boolean }
  | { type: "tick"; elapsed: number }
  | { type: "stop" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "start":
      return { stageLabel: getStageLabel(0), showEta: action.isFirst };
    case "tick":
      return { ...state, stageLabel: getStageLabel(action.elapsed) };
    case "stop":
      return { stageLabel: getStageLabel(0), showEta: false };
    default:
      return state;
  }
}

/**
 * Cycles through staged status labels while an AI generation is in flight.
 * On the first generation of the session it also sets `showEta: true` so the
 * caller can surface a time estimate hint.
 *
 * @param isLoading - `true` while the `/api/generate` request is in flight.
 */
export function useGenerationStatus(
  isLoading: boolean,
): GenerationStatusResult {
  const [{ stageLabel, showEta }, dispatch] = useReducer(reducer, {
    stageLabel: getStageLabel(0),
    showEta: false,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isLoading) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      dispatch({ type: "stop" });
      return;
    }

    const isFirst = !_hasGeneratedThisSession;
    _hasGeneratedThisSession = true;

    const startTime = Date.now();
    intervalRef.current = setInterval(() => {
      dispatch({ type: "tick", elapsed: Date.now() - startTime });
    }, 500);

    // Dispatch start after the interval is set so the first tick fires via
    // the interval callback rather than a synchronous setState in effect body.
    dispatch({ type: "start", isFirst });

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isLoading]);

  return { stageLabel, showEta, etaHint: ETA_HINT };
}
