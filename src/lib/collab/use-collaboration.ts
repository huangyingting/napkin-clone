import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import * as Y from "yjs";

import { adjustIndex, applyTextDiff } from "./y-text";

export type CollabStatus = "connecting" | "connected" | "disconnected";

export type Peer = {
  clientId: number;
  name: string;
  color: string;
  self: boolean;
};

type EditableElement = HTMLTextAreaElement | HTMLInputElement;

/**
 * Two-way binds a `Y.Text` to a controlled `<textarea>`/`<input>`.
 *
 * - Local edits are applied to the shared text as a minimal diff (so concurrent
 *   edits merge) and reported via `onLocalChange` for DB persistence.
 * - Remote edits update the controlled value and preserve the user's caret by
 *   re-mapping it through the change delta.
 *
 * Until collaboration is `ready` (seeded), the DB `initial` value is shown; the
 * caller keeps the element read-only via `editable`.
 */
export function useYText(
  ytext: Y.Text,
  options: {
    initial: string;
    ready: boolean;
    editable: boolean;
    localOrigin: symbol;
    elementRef: React.RefObject<EditableElement | null>;
    onLocalChange?: (value: string) => void;
  },
): { value: string; onChange: (next: string) => void } {
  const { initial, ready, editable, localOrigin, elementRef, onLocalChange } =
    options;
  const [liveValue, setLiveValue] = useState("");
  const pendingCursor = useRef<{ start: number; end: number } | null>(null);
  const onLocalChangeRef = useRef(onLocalChange);

  useEffect(() => {
    onLocalChangeRef.current = onLocalChange;
  }, [onLocalChange]);

  useEffect(() => {
    const observer = (event: Y.YTextEvent, transaction: Y.Transaction) => {
      const next = ytext.toString();
      const isLocal = transaction.origin === localOrigin;

      if (!isLocal) {
        const el = elementRef.current;
        if (
          el &&
          typeof el.selectionStart === "number" &&
          typeof el.selectionEnd === "number" &&
          el.ownerDocument.activeElement === el
        ) {
          pendingCursor.current = {
            start: adjustIndex(el.selectionStart, event.delta),
            end: adjustIndex(el.selectionEnd, event.delta),
          };
        }
      }

      setLiveValue(next);

      if (isLocal) {
        onLocalChangeRef.current?.(next);
      }
    };

    ytext.observe(observer);
    return () => ytext.unobserve(observer);
  }, [ytext, localOrigin, elementRef]);

  // Restore the re-mapped caret after a remote edit re-renders the element.
  useLayoutEffect(() => {
    const cursor = pendingCursor.current;
    const el = elementRef.current;
    if (cursor && el) {
      el.setSelectionRange(cursor.start, cursor.end);
      pendingCursor.current = null;
    }
  });

  const onChange = useCallback(
    (next: string) => {
      if (!editable) {
        return;
      }
      setLiveValue(next);
      const current = ytext.toString();
      if (current !== next) {
        applyTextDiff(ytext, current, next, localOrigin);
      }
    },
    [ytext, editable, localOrigin],
  );

  // Before the room is seeded, show the DB value; afterwards the shared text is
  // the single source of truth (so "delete everything" stays empty).
  const value = ready ? liveValue : initial;

  return { value, onChange };
}
