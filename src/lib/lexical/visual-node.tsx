import { addClassNamesToElement } from "@lexical/utils";
import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalUpdateJSON,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import { createContext, useContext, type JSX, type ReactNode } from "react";

import { safeParseVisual, type Visual } from "@/lib/visual/schema";

export type VisualNodeRendererProps = {
  nodeKey: string;
  visual: Visual;
  visualId: string;
};

type RenderVisualNode = (props: VisualNodeRendererProps) => ReactNode;

const VisualNodeRendererContext = createContext<RenderVisualNode | null>(null);

function FallbackVisualNodeRenderer({
  visualId,
}: VisualNodeRendererProps): JSX.Element {
  return (
    <div
      data-lexical-visual-id={visualId}
      data-lexical-visual-renderer="missing"
    >
      Visual unavailable
    </div>
  );
}

function VisualNodeDecoration(props: VisualNodeRendererProps): JSX.Element {
  const renderVisualNode = useContext(VisualNodeRendererContext);
  if (renderVisualNode) {
    return <>{renderVisualNode(props)}</>;
  }
  return <FallbackVisualNodeRenderer {...props} />;
}

export function VisualNodeRendererProvider({
  renderVisualNode,
  children,
}: {
  renderVisualNode: RenderVisualNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <VisualNodeRendererContext.Provider value={renderVisualNode}>
      {children}
    </VisualNodeRendererContext.Provider>
  );
}

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

  /**
   * Pairs with {@link exportDOM} so HTML copy/paste round-trips. Lexical warns
   * when a node defines a custom `exportDOM` without a matching `importDOM`,
   * because pasted HTML would otherwise fail to reconstruct the node. We match
   * the `<div data-lexical-visual-id>` emitted by `exportDOM` and rebuild a
   * `VisualNode` from the embedded, schema-validated payload.
   */
  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute("data-lexical-visual-id")) {
          return null;
        }
        return {
          conversion: $convertVisualElement,
          priority: 2,
        };
      },
    };
  }

  constructor(visual: Visual, visualId?: string, key?: NodeKey) {
    /* node:coverage ignore next -- Constructor paths are asserted; tsx maps DecoratorNode super() as uncovered. */
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
      /* node:coverage ignore next 2 */ /* createDOM class application is asserted; tsx maps the branch close as uncovered. */
      addClassNamesToElement(div, className);
    }
    return div;
  }

  /* node:coverage ignore next 3 */ /* updateDOM is asserted false; tsx maps the method tail as uncovered. */
  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    /* node:coverage ignore next -- exportDOM is asserted with a document stub; tsx maps createElement as uncovered. */
    const element = document.createElement("div");
    element.setAttribute("data-lexical-visual-id", this.__visualId);
    // Embed the full payload so the matching importDOM can rebuild the visual on
    // paste (the id alone can't reconstruct the content).
    element.setAttribute("data-lexical-visual", JSON.stringify(this.__visual));
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
    return (
      <VisualNodeDecoration
        nodeKey={this.getKey()}
        visual={this.__visual}
        visualId={this.__visualId}
      />
    );
  }
}

export function $createVisualNode(
  visual: Visual,
  visualId?: string,
): VisualNode {
  return $applyNodeReplacement(new VisualNode(visual, visualId));
}

/**
 * Rebuilds a {@link VisualNode} from the `<div data-lexical-visual>` produced by
 * {@link VisualNode.exportDOM}. The payload is re-validated with
 * {@link safeParseVisual}; an invalid/absent payload skips the conversion so
 * pasted markup degrades to its default handling instead of crashing. A fresh
 * visualId is minted (the constructor default) so a pasted copy never collides
 * with the source node's id in the mirrored `Visual` rows.
 */
function $convertVisualElement(
  domNode: HTMLElement,
): DOMConversionOutput | null {
  const raw = domNode.getAttribute("data-lexical-visual");
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = safeParseVisual(parsed);
  if (!result.success) {
    return null;
  }
  return { node: $createVisualNode(result.data) };
}

export function $isVisualNode(node: unknown): node is VisualNode {
  return node instanceof VisualNode;
}
