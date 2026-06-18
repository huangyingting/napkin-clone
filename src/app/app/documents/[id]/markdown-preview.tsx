import { parseMarkdown, type MarkdownBlock } from "@/lib/markdown";

/**
 * Renders a single Markdown block (heading, bullet list, or paragraph) as a
 * plain React element. Intentionally directive-free so it can be reused by both
 * the server-rendered preview/read-only views and the client-side per-block
 * visual generator (US-009).
 */
export function BlockContent({ block }: { block: MarkdownBlock }) {
  if (block.kind === "heading") {
    if (block.level === 1) {
      return (
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {block.text}
        </h1>
      );
    }
    if (block.level === 2) {
      return (
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {block.text}
        </h2>
      );
    }
    return (
      <h3 className="text-lg font-semibold tracking-tight text-zinc-800 dark:text-zinc-200">
        {block.text}
      </h3>
    );
  }

  if (block.kind === "bullets") {
    return (
      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex}>{item}</li>
        ))}
      </ul>
    );
  }

  return (
    <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
      {block.text}
    </p>
  );
}

/**
 * Renders Markdown text as structured blocks (headings, bullet lists,
 * paragraphs) using plain React elements. Shared between the editor preview and
 * (later) read-only document views, so it is intentionally directive-free.
 */
export function MarkdownPreview({ source }: { source: string }) {
  const blocks = parseMarkdown(source);

  if (blocks.length === 0) {
    return (
      <p className="text-sm text-zinc-400 dark:text-zinc-500">
        Nothing to preview yet. Switch to “Write” to add some text.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block) => (
        <BlockContent key={block.id} block={block} />
      ))}
    </div>
  );
}
