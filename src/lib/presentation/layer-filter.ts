/**
 * Pure layer-list filtering (#652).
 *
 * Extends the layer panel's filter beyond plain name matching to support a
 * lightweight token syntax so users can navigate dense slides:
 *
 *   - `kind:text` / `kind:image` / …  — match by element kind
 *   - `is:locked` / `is:unlocked`      — match by lock state
 *   - `is:hidden` / `is:visible`       — match by visibility
 *   - `is:source` / `is:linked`        — element carries a source ref
 *   - `is:group` / `is:grouped`        — element belongs to a group
 *   - any other word                    — substring match on the display name
 *
 * Multiple tokens combine with AND. Pure and DOM-free for unit testing.
 */

/** Minimal element shape the filter inspects. */
export interface FilterableLayer {
  kind: string;
  locked?: boolean;
  hidden?: boolean;
  groupId?: string;
  sourceRef?: unknown;
}

/** Parsed filter predicate set. */
export interface LayerQuery {
  /** Lowercased free-text name fragments (AND). */
  text: string[];
  kinds: string[];
  locked?: boolean;
  hidden?: boolean;
  source?: boolean;
  grouped?: boolean;
}

/** Parses a raw query string into structured {@link LayerQuery} predicates. */
export function parseLayerQuery(query: string): LayerQuery {
  const out: LayerQuery = { text: [], kinds: [] };
  for (const raw of query.trim().toLowerCase().split(/\s+/)) {
    if (!raw) continue;
    if (raw.startsWith("kind:")) {
      const k = raw.slice(5);
      if (k) out.kinds.push(k);
    } else if (raw === "is:locked") {
      out.locked = true;
    } else if (raw === "is:unlocked") {
      out.locked = false;
    } else if (raw === "is:hidden") {
      out.hidden = true;
    } else if (raw === "is:visible") {
      out.hidden = false;
    } else if (raw === "is:source" || raw === "is:linked") {
      out.source = true;
    } else if (raw === "is:standalone" || raw === "is:unlinked") {
      out.source = false;
    } else if (raw === "is:group" || raw === "is:grouped") {
      out.grouped = true;
    } else if (raw === "is:ungrouped") {
      out.grouped = false;
    } else {
      out.text.push(raw);
    }
  }
  return out;
}

/** True when a single element satisfies every predicate in `q`. */
function matchesQuery<T extends FilterableLayer>(
  el: T,
  q: LayerQuery,
  name: string,
): boolean {
  if (q.kinds.length > 0 && !q.kinds.includes(el.kind)) return false;
  if (q.locked !== undefined && Boolean(el.locked) !== q.locked) return false;
  if (q.hidden !== undefined && Boolean(el.hidden) !== q.hidden) return false;
  if (q.source !== undefined && (el.sourceRef !== undefined) !== q.source) {
    return false;
  }
  if (q.grouped !== undefined && (el.groupId !== undefined) !== q.grouped) {
    return false;
  }
  if (q.text.length > 0) {
    const lower = name.toLowerCase();
    if (!q.text.every((t) => lower.includes(t))) return false;
  }
  return true;
}

/**
 * Filters `elements` by the raw `query`, preserving input order. An empty or
 * whitespace-only query returns the list unchanged. `nameOf` supplies each
 * element's display name for free-text matching.
 */
export function filterLayers<T extends FilterableLayer>(
  elements: readonly T[],
  query: string,
  nameOf: (el: T) => string,
): T[] {
  const q = parseLayerQuery(query);
  const hasPredicate =
    q.text.length > 0 ||
    q.kinds.length > 0 ||
    q.locked !== undefined ||
    q.hidden !== undefined ||
    q.source !== undefined ||
    q.grouped !== undefined;
  if (!hasPredicate) return [...elements];
  return elements.filter((el) => matchesQuery(el, q, nameOf(el)));
}
