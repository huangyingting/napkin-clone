import { addClassNamesToElement } from "@lexical/utils";
import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalUpdateJSON,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import type { JSX } from "react";

import { VisualRenderer } from "@/components/visual/visual-renderer";
import { safeParseVisual, type Visual } from "@/lib/visual/schema";

/**
 * Serialized shape persisted into `contentJson`. The `visual` payload is the
 * canonical {@link Visual} JSON; `visualId` is a stable id used to correlate the
 * node with a `Visual` database row (US-011) and to target it for contextual
 * editing (US-012/013).
 */
export type SerializedVisualNode = Spread<
  {
    visual: Visual;
    visualId: string;
  },
  SerializedLexicalNode
>;

function createVisualId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `visual-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/**
 * Directive-free decorator rendered inside the editor for a visual block. The
 * stored payload is validated with {@link safeParseVisual} at render time so a
 * malformed visual degrades to a placeholder instead of crashing the editor.
 */
function VisualDecorator({ visual }: { visual: Visual }): JSX.Element {
  const result = safeParseVisual(visual);
  if (!result.success) {
    return (
      <div
        role="img"
        aria-label="Unavailable visual"
        className="my-4 rounded-2xl border border-dashed border-black/[.12] bg-zinc-50 p-6 text-center text-sm text-zinc-500 dark:border-white/[.12] dark:bg-zinc-900 dark:text-zinc-400"
      >
        This visual could not be displayed.
      </div>
    );
  }
  return (
    <div className="my-4 overflow-hidden rounded-2xl border border-black/[.06] bg-white p-2 dark:border-white/[.08] dark:bg-zinc-950">
      <VisualRenderer visual={result.data} className="h-auto w-full" />
    </div>
  );
}

/**
 * A Lexical {@link DecoratorNode} that makes a visual a first-class block in the
 * document. It serializes its payload into `contentJson` via
 * {@link exportJSON}/{@link importJSON} and renders through the directive-free
 * {@link VisualRenderer}.
 */
export class VisualNode extends DecoratorNode<JSX.Element> {
  __visual: Visual;
  __visualId: string;

  static getType(): string {
    return "visual";
  }

  static clone(node: VisualNode): VisualNode {
    return new VisualNode(node.__visual, node.__visualId, node.__key);
  }

  static importJSON(serializedNode: SerializedVisualNode): VisualNode {
    return $createVisualNode(
      serializedNode.visual,
      serializedNode.visualId,
    ).updateFromJSON(serializedNode);
  }

  constructor(visual: Visual, visualId?: string, key?: NodeKey) {
    super(key);
    this.__visual = visual;
    this.__visualId = visualId ?? createVisualId();
  }

  exportJSON(): SerializedVisualNode {
    return {
      ...super.exportJSON(),
      visual: this.__visual,
      visualId: this.__visualId,
    };
  }

  updateFromJSON(
    serializedNode: LexicalUpdateJSON<SerializedVisualNode>,
  ): this {
    const self = super.updateFromJSON(serializedNode);
    self.__visual = serializedNode.visual;
    self.__visualId = serializedNode.visualId;
    return self;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    const className = config.theme.visual;
    if (className) {
      addClassNamesToElement(div, className);
    }
    return div;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("div");
    element.setAttribute("data-lexical-visual-id", this.__visualId);
    return { element };
  }

  getVisual(): Visual {
    return this.getLatest().__visual;
  }

  getVisualId(): string {
    return this.getLatest().__visualId;
  }

  setVisual(visual: Visual): this {
    const writable = this.getWritable();
    writable.__visual = visual;
    return writable;
  }

  isInline(): false {
    return false;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  decorate(): JSX.Element {
    return <VisualDecorator visual={this.__visual} />;
  }
}

export function $createVisualNode(
  visual: Visual,
  visualId?: string,
): VisualNode {
  return $applyNodeReplacement(new VisualNode(visual, visualId));
}

export function $isVisualNode(node: unknown): node is VisualNode {
  return node instanceof VisualNode;
}
