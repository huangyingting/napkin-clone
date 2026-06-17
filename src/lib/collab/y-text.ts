import type * as Y from "yjs";

/** A Quill-style delta op as produced by `Y.Text` `observe` events. */
type DeltaOp = {
  retain?: number;
  insert?: string | object;
  delete?: number;
};

/**
 * Applies the minimal single-region edit that turns `oldStr` into `newStr` onto
 * a `Y.Text`, as one transaction. Computing the common prefix/suffix keeps the
 * change small so concurrent edits in *different* regions merge cleanly (CRDT)
 * instead of clobbering each other the way a full delete+insert would.
 *
 * `origin` is attached to the transaction so observers can tell whether a change
 * came from this client.
 */
export function applyTextDiff(
  ytext: Y.Text,
  oldStr: string,
  newStr: string,
  origin?: unknown,
): void {
  if (oldStr === newStr) {
    return;
  }

  let start = 0;
  const minLen = Math.min(oldStr.length, newStr.length);
  while (start < minLen && oldStr[start] === newStr[start]) {
    start += 1;
  }

  let endOld = oldStr.length;
  let endNew = newStr.length;
  while (
    endOld > start &&
    endNew > start &&
    oldStr[endOld - 1] === newStr[endNew - 1]
  ) {
    endOld -= 1;
    endNew -= 1;
  }

  const doc = ytext.doc;
  const run = () => {
    if (endOld > start) {
      ytext.delete(start, endOld - start);
    }
    if (endNew > start) {
      ytext.insert(start, newStr.slice(start, endNew));
    }
  };

  if (doc) {
    doc.transact(run, origin);
  } else {
    run();
  }
}

/**
 * Maps a caret/selection index in the *pre-change* text to its position in the
 * *post-change* text, given the `Y.Text` observe delta. This keeps a user's
 * cursor stable when a remote collaborator edits text before it. Insertions at
 * exactly the cursor push the cursor right (it "sticks" after remote inserts).
 */
export function adjustIndex(index: number, delta: DeltaOp[]): number {
  let pos = 0;
  let result = index;

  for (const op of delta) {
    if (op.retain != null) {
      pos += op.retain;
    } else if (op.insert != null) {
      const len = typeof op.insert === "string" ? op.insert.length : 1;
      if (pos <= index) {
        result += len;
      }
    } else if (op.delete != null) {
      if (pos < index) {
        result -= Math.min(op.delete, index - pos);
      }
      pos += op.delete;
    }
  }

  return Math.max(0, result);
}

/** A small, high-contrast palette for presence avatars. */
const PRESENCE_COLORS = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
];

/** Deterministically picks a presence color from a numeric id (e.g. clientID). */
export function colorFromId(id: number): string {
  const index = Math.abs(Math.trunc(id)) % PRESENCE_COLORS.length;
  return PRESENCE_COLORS[index];
}

/** Two uppercase initials for an avatar, derived from a display name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
