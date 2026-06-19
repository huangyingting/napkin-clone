import { Fragment, type JSX, type ReactNode } from "react";

import { VisualRenderer } from "@/components/visual/visual-renderer";
import { markdownToLexicalStateObject } from "@/lib/lexical/from-markdown";
import { safeParseVisual } from "@/lib/visual/schema";

/**
 * Directive-free, read-only renderer for a serialized Lexical editor state.
 *
 * It walks the `{ root: { children } }` JSON tree that Lexical's
 * `editorState.toJSON()` produces and renders each block/inline node as a plain
 * React element (no `LexicalComposer`, no client directive), so it can be used
 * in server components such as the public `/share/[shareId]` and
 * `/embed/[shareId]` pages. Inline {@link VisualNode}s are rendered through the
 * directive-free {@link VisualRenderer}.
 *
 * Read-only viewers see no editing affordances — there is no spark, "+"/slash
 * menu, or contextual controls; only the rendered content.
 */

// Lexical text-format bitmask flags (see lexical's `TextNode` formats).
const IS_BOLD = 1;
const IS_ITALIC = 1 << 1;
const IS_STRIKETHROUGH = 1 << 2;
const IS_UNDERLINE = 1 << 3;
const IS_CODE = 1 << 4;
const IS_SUBSCRIPT = 1 << 5;
const IS_SUPERSCRIPT = 1 << 6;

type SerializedNode = {
  type?: string;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is SerializedNode {
  return typeof value === "object" && value !== null;
}

function childrenOf(node: SerializedNode): unknown[] {
  return Array.isArray(node.children) ? node.children : [];
}

/** Wraps text in the inline formatting elements indicated by the bitmask. */
function formatText(text: string, format: number): ReactNode {
  let node: ReactNode = text;
  if (format & IS_CODE) {
    node = (
      <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-zinc-800">
        {node}
      </code>
    );
  }
  if (format & IS_BOLD) {
    node = <strong className="font-semibold">{node}</strong>;
  }
  if (format & IS_ITALIC) {
    node = <em className="italic">{node}</em>;
  }
  if (format & IS_UNDERLINE && format & IS_STRIKETHROUGH) {
    node = (
      <span className="[text-decoration:underline_line-through]">{node}</span>
    );
  } else if (format & IS_UNDERLINE) {
    node = <span className="underline">{node}</span>;
  } else if (format & IS_STRIKETHROUGH) {
    node = <span className="line-through">{node}</span>;
  }
  if (format & IS_SUBSCRIPT) {
    node = <sub>{node}</sub>;
  }
  if (format & IS_SUPERSCRIPT) {
    node = <sup>{node}</sup>;
  }
  return node;
}

/** Renders the inline children of a block (text, line breaks, links). */
function renderInline(nodes: unknown[]): ReactNode[] {
  return nodes.map((raw, index) => {
    if (!isRecord(raw)) {
      return null;
    }
    const node = raw;
    const key = index;

    if (node.type === "linebreak") {
      return <br key={key} />;
    }
    if (node.type === "tab") {
      return <Fragment key={key}>{"\t"}</Fragment>;
    }
    if (node.type === "text") {
      const text = typeof node.text === "string" ? node.text : "";
      const format = typeof node.format === "number" ? node.format : 0;
      return <Fragment key={key}>{formatText(text, format)}</Fragment>;
    }
    if (node.type === "link" || node.type === "autolink") {
      const url = typeof node.url === "string" ? node.url : "#";
      return (
        <a
          key={key}
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-indigo-600 underline underline-offset-2 dark:text-indigo-400"
        >
          {renderInline(childrenOf(node))}
        </a>
      );
    }
    // Unknown inline node — fall back to its text content.
    return <Fragment key={key}>{renderInline(childrenOf(node))}</Fragment>;
  });
}

/** Renders a list item, supporting nested lists. */
function renderListItem(raw: unknown, key: number): ReactNode {
  if (!isRecord(raw)) {
    return null;
  }
  const node = raw;
  const children = childrenOf(node);
  // A list item can contain a nested list (Lexical wraps nested lists in a
  // listitem); render those inline so the structure round-trips.
  const hasNestedList = children.some(
    (child) => isRecord(child) && child.type === "list",
  );
  if (hasNestedList) {
    return (
      <li key={key} className="list-none">
        {children.map((child, childIndex) => {
          if (isRecord(child) && child.type === "list") {
            return renderBlock(child, childIndex);
          }
          return <Fragment key={childIndex}>{renderInline([child])}</Fragment>;
        })}
      </li>
    );
  }
  return <li key={key}>{renderInline(children)}</li>;
}

/** Renders a single block-level node. */
function renderBlock(raw: unknown, key: number): ReactNode {
  if (!isRecord(raw)) {
    return null;
  }
  const node = raw;

  switch (node.type) {
    case "heading": {
      const tag = typeof node.tag === "string" ? node.tag : "h2";
      const inline = renderInline(childrenOf(node));
      if (tag === "h1") {
        return (
          <h1
            key={key}
            className="mb-3 mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
          >
            {inline}
          </h1>
        );
      }
      if (tag === "h3") {
        return (
          <h3
            key={key}
            className="mb-2 mt-2 text-xl font-semibold tracking-tight text-zinc-800 dark:text-zinc-200"
          >
            {inline}
          </h3>
        );
      }
      return (
        <h2
          key={key}
          className="mb-3 mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
        >
          {inline}
        </h2>
      );
    }
    case "quote":
      return (
        <blockquote
          key={key}
          className="mb-3 border-l-4 border-zinc-300 pl-4 italic text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
        >
          {renderInline(childrenOf(node))}
        </blockquote>
      );
    case "list": {
      const ordered = node.listType === "number" || node.tag === "ol";
      const items = childrenOf(node).map((item, itemIndex) =>
        renderListItem(item, itemIndex),
      );
      if (ordered) {
        return (
          <ol
            key={key}
            className="mb-3 ml-6 list-decimal leading-7 text-zinc-700 dark:text-zinc-300"
          >
            {items}
          </ol>
        );
      }
      return (
        <ul
          key={key}
          className="mb-3 ml-6 list-disc leading-7 text-zinc-700 dark:text-zinc-300"
        >
          {items}
        </ul>
      );
    }
    case "horizontalrule":
      return (
        <hr
          key={key}
          className="my-6 border-0 border-t border-zinc-200 dark:border-zinc-800"
        />
      );
    case "visual": {
      const parsed = safeParseVisual(node.visual);
      if (!parsed.success) {
        return (
          <div
            key={key}
            data-block-visual
            className="my-2 rounded-lg border border-black/[.06] bg-zinc-50 p-4 text-sm text-zinc-400 dark:border-white/[.08] dark:bg-zinc-900 dark:text-zinc-600"
          >
            This visual could not be displayed.
          </div>
        );
      }
      return (
        <div
          key={key}
          data-block-visual
          className="my-2 overflow-hidden rounded-lg border border-black/[.06] bg-white dark:border-white/[.08] dark:bg-zinc-950"
        >
          <VisualRenderer visual={parsed.data} className="h-auto w-full" />
        </div>
      );
    }
    case "paragraph": {
      const inline = renderInline(childrenOf(node));
      return (
        <p
          key={key}
          className="mb-3 leading-7 text-zinc-700 dark:text-zinc-300"
        >
          {inline.length > 0 ? inline : <br />}
        </p>
      );
    }
    default:
      return (
        <div
          key={key}
          className="mb-3 leading-7 text-zinc-700 dark:text-zinc-300"
        >
          {renderInline(childrenOf(node))}
        </div>
      );
  }
}

function parseState(state: unknown): SerializedNode | null {
  let parsed: unknown = state;
  if (typeof state === "string") {
    try {
      parsed = JSON.parse(state);
    } catch {
      return null;
    }
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const root = parsed.root;
  return isRecord(root) ? root : null;
}

/**
 * Renders a document read-only from its Lexical `contentJson`. When no
 * serialized state is available (legacy documents that only have a Markdown
 * `content` string), pass `fallbackMarkdown` and it is converted on the fly with
 * the US-004 converter so unmigrated documents still render.
 */
export function LexicalReadOnly({
  state,
  fallbackMarkdown,
  className,
}: {
  state?: unknown;
  fallbackMarkdown?: string | null;
  className?: string;
}): JSX.Element {
  let root = parseState(state);

  if (!root || !Array.isArray(root.children) || root.children.length === 0) {
    if (fallbackMarkdown && fallbackMarkdown.trim()) {
      root = markdownToLexicalStateObject(fallbackMarkdown).root;
    }
  }

  const children =
    root && Array.isArray(root.children) ? (root.children as unknown[]) : [];

  if (children.length === 0) {
    return (
      <div className={className}>
        <p className="text-sm text-zinc-400 dark:text-zinc-600">
          No content yet.
        </p>
      </div>
    );
  }

  return (
    <div className={["ghost-prose", className].filter(Boolean).join(" ")}>
      {children.map((child, index) => renderBlock(child, index))}
    </div>
  );
}
