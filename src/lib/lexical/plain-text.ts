/**
 * Framework-free helpers for working with serialized Lexical editor state.
 *
 * These operate purely on the JSON shape that Lexical's
 * `editorState.toJSON()` produces (a `{ root: { children: [...] } }` tree), so
 * they never import `lexical`/React and can run on the server (e.g. the
 * `saveDocumentLexical` action) and under `node --test`.
 */

/** The minimal node shape we read out of a serialized Lexical state. */
type SerializedNode = {
  type?: string;
  text?: string;
  children?: unknown;
};

function asNode(value: unknown): SerializedNode | null {
  if (value && typeof value === "object") {
    return value as SerializedNode;
  }
  return null;
}

/**
 * Concatenates all of the text contained within a single (inline or block)
 * node, recursing through its children. `linebreak`/`tab` nodes are mapped to
 * their literal characters so a soft line break inside a paragraph survives the
 * projection.
 */
function nodeText(value: unknown): string {
  const node = asNode(value);
  if (!node) {
    return "";
  }

  if (node.type === "linebreak") {
    return "\n";
  }
  if (node.type === "tab") {
    return "\t";
  }
  if (typeof node.text === "string") {
    return node.text;
  }
  if (Array.isArray(node.children)) {
    // List items are block-level, so separate them with newlines; inline
    // children (within a paragraph/heading/list item) are concatenated.
    const separator = node.type === "list" ? "\n" : "";
    return node.children.map(nodeText).join(separator);
  }
  return "";
}

/**
 * Projects a serialized Lexical editor state down to a plain-text string: one
 * line per top-level block (paragraph, heading, list item, …). Used to keep the
 * `Document.content` column in sync with the Lexical `contentJson` so AI block
 * text, search, and the read-only fallback keep working.
 *
 * Accepts either the already-parsed state object or its JSON string form;
 * malformed input yields an empty string rather than throwing.
 */
export function lexicalStateToPlainText(state: unknown): string {
  let parsed: unknown = state;
  if (typeof state === "string") {
    try {
      parsed = JSON.parse(state);
    } catch {
      return "";
    }
  }

  const outer = asNode(parsed);
  const root = asNode(outer ? (outer as { root?: unknown }).root : null);
  if (!root || !Array.isArray(root.children)) {
    return "";
  }

  return root.children
    .map(nodeText)
    .join("\n")
    .replace(/[^\S\n]+\n/g, "\n")
    .trimEnd();
}
