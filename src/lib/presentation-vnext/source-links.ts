import type { PresentationDiagnostic } from "./diagnostics";
import { makeDiagnostic } from "./diagnostics";
import type {
  DeckV7,
  NodeSourceMetadata,
  Paragraph,
  SlideChildNode,
  SlideNode,
  SourceRefreshState,
  TableContent,
  TextContent,
} from "./schema";
import {
  findSourceBlock,
  type SourceBlockIndex,
  type SourceBlockIndexEntry,
} from "./block-index";

export type SourceLinkClassification = {
  slideId: string;
  slideIndex: number;
  nodeId: string;
  nodeType: SlideChildNode["type"];
  nodeName?: string;
  source: NodeSourceMetadata;
  state: SourceRefreshState;
  reason: string;
  block?: SourceBlockIndexEntry;
  sourceHash?: string;
  currentHash?: string;
};

export type SourceReviewItem = SourceLinkClassification & {
  slideLabel: string;
  sourceLabel: string;
};

export type SourceRefreshResult =
  | { status: "refreshed"; deck: DeckV7; nodeId: string; slideId: string }
  | {
      status: "skipped";
      deck: DeckV7;
      nodeId: string;
      slideId: string;
      reason: string;
    };

export type SourceRefreshAllResult = {
  deck: DeckV7;
  refreshed: SourceLinkClassification[];
  skipped: { item: SourceLinkClassification; reason: string }[];
};

function mapSlides(deck: DeckV7, fn: (slide: SlideNode) => SlideNode): DeckV7 {
  return { ...deck, slides: deck.slides.map(fn) };
}

function mapNodeById(
  node: SlideChildNode,
  nodeId: string,
  fn: (node: SlideChildNode) => SlideChildNode,
): SlideChildNode {
  if (node.id === nodeId) return fn(node);
  if (node.type === "group") {
    return {
      ...node,
      children: node.children.map((child) => mapNodeById(child, nodeId, fn)),
    };
  }
  return node;
}

function findNodeById(
  nodes: readonly SlideChildNode[],
  nodeId: string,
): SlideChildNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.type === "group") {
      const nested = findNodeById(node.children, nodeId);
      if (nested) return nested;
    }
  }
  return undefined;
}

function collectNodes(
  nodes: readonly SlideChildNode[],
  result: SlideChildNode[],
): void {
  for (const node of nodes) {
    result.push(node);
    if (node.type === "group") collectNodes(node.children, result);
  }
}

function sourceWithRefresh(
  source: NodeSourceMetadata,
  state: SourceRefreshState,
  checkedAt: string,
  reason: string,
  block?: SourceBlockIndexEntry,
): NodeSourceMetadata {
  return {
    ...source,
    ...(block
      ? {
          ...(state === "fresh"
            ? {
                blockKind: block.kind,
                contentHash: block.hash,
                ...(block.revision ? { blockRevision: block.revision } : {}),
              }
            : {}),
          display: {
            ...(source.display ?? {}),
            blockLabel: block.displayLabel,
          },
        }
      : {}),
    refresh: {
      state,
      checkedAt,
      ...(state === "fresh" ? { refreshedAt: checkedAt } : {}),
      ...(block ? { sourceHash: block.hash } : {}),
      reason,
    },
  };
}

export function classifyNodeSource(
  slide: SlideNode,
  slideIndex: number,
  node: SlideChildNode,
  index: SourceBlockIndex,
): SourceLinkClassification | undefined {
  const source = node.source;
  if (!source) return undefined;
  const base = {
    slideId: slide.id,
    slideIndex,
    nodeId: node.id,
    nodeType: node.type,
    ...(node.name ? { nodeName: node.name } : {}),
    source,
  };

  if (source.unlinked === true) {
    return {
      ...base,
      state: "unlinked",
      reason: "Source dependency was explicitly unlinked.",
    };
  }
  if (!source.documentId || !source.blockId || !source.contentHash) {
    return {
      ...base,
      state: "unknown",
      reason:
        "Source metadata is missing a document id, block id, or content hash.",
    };
  }
  if (source.documentId !== index.documentId) {
    return {
      ...base,
      state: "unknown",
      reason:
        "Source belongs to a different document and requires explicit remote resolution.",
    };
  }

  const block = findSourceBlock(index, source);
  if (!block) {
    return {
      ...base,
      state: "orphan",
      reason: "Source block is missing from the current document.",
    };
  }
  if (block.hash !== source.contentHash) {
    return {
      ...base,
      state: "stale",
      reason: "Source block content changed.",
      block,
      sourceHash: source.contentHash,
      currentHash: block.hash,
    };
  }
  return {
    ...base,
    state: "fresh",
    reason: "Source block is current.",
    block,
    sourceHash: source.contentHash,
    currentHash: block.hash,
  };
}

export function classifyDeckSourceLinks(
  deck: DeckV7,
  index: SourceBlockIndex,
): SourceLinkClassification[] {
  const result: SourceLinkClassification[] = [];
  deck.slides.forEach((slide, slideIndex) => {
    const nodes: SlideChildNode[] = [];
    collectNodes(slide.children, nodes);
    for (const node of nodes) {
      const classification = classifyNodeSource(slide, slideIndex, node, index);
      if (classification) result.push(classification);
    }
  });
  return result;
}

export function sourceReviewItems(
  deck: DeckV7,
  classifications: readonly SourceLinkClassification[],
): SourceReviewItem[] {
  return classifications
    .filter((item) => item.state !== "fresh")
    .map((item) => {
      const slide = deck.slides.find(
        (candidate) => candidate.id === item.slideId,
      );
      return {
        ...item,
        slideLabel: slide?.name ?? `Slide ${item.slideIndex + 1}`,
        sourceLabel:
          item.block?.displayLabel ??
          item.source.display?.blockLabel ??
          item.source.blockId ??
          "Unknown source",
      };
    });
}

export function sourceLinkDiagnostics(
  classifications: readonly SourceLinkClassification[],
): PresentationDiagnostic[] {
  return classifications.flatMap((item): PresentationDiagnostic[] => {
    const details = {
      status: item.state,
      sourceDocumentId: item.source.documentId ?? "",
      sourceBlockId: item.source.blockId ?? "",
      sourceBlockKind: item.source.blockKind ?? "",
      reason: item.reason,
    };
    if (item.state === "stale") {
      return [
        makeDiagnostic(
          "source-link-stale",
          "warning",
          `Source link for node "${item.nodeName ?? item.nodeId}" is stale.`,
          {
            slideId: item.slideId,
            nodeId: item.nodeId,
            action: "refresh-source",
            details,
          },
        ),
      ];
    }
    if (item.state === "orphan") {
      return [
        makeDiagnostic(
          "source-link-orphan",
          "warning",
          `Source block "${item.source.blockId ?? "unknown"}" is missing.`,
          {
            slideId: item.slideId,
            nodeId: item.nodeId,
            action: "relink-source",
            details,
          },
        ),
      ];
    }
    if (item.state === "unknown") {
      return [
        makeDiagnostic(
          "source-link-unknown",
          "info",
          `Source link for node "${item.nodeName ?? item.nodeId}" needs review.`,
          {
            slideId: item.slideId,
            nodeId: item.nodeId,
            action: "open-source-review",
            details,
          },
        ),
      ];
    }
    if (item.state === "unlinked") {
      return [
        makeDiagnostic(
          "source-link-unlinked",
          "info",
          `Node "${item.nodeName ?? item.nodeId}" is marked unlinked from its source.`,
          {
            slideId: item.slideId,
            nodeId: item.nodeId,
            action: "relink-source",
            details,
          },
        ),
      ];
    }
    return [];
  });
}

function paragraphFromEntry(
  nodeId: string,
  entry: SourceBlockIndexEntry,
): Paragraph | undefined {
  if (entry.refresh.kind !== "text") return undefined;
  return {
    id: `${nodeId}-source-p-1`,
    text: entry.refresh.text,
    ...(entry.refresh.runs && entry.refresh.runs.length > 0
      ? { runs: entry.refresh.runs }
      : {}),
  };
}

function refreshedSource(
  entry: SourceBlockIndexEntry,
  now: string,
  existing?: NodeSourceMetadata,
): NodeSourceMetadata {
  return {
    ...(existing ?? {}),
    documentId: entry.documentId,
    blockId: entry.id,
    blockKind: entry.kind,
    contentHash: entry.hash,
    ...(entry.revision ? { blockRevision: entry.revision } : {}),
    linkedAt: now,
    display: {
      ...(existing?.display ?? {}),
      blockLabel: entry.displayLabel,
    },
    refresh: {
      state: "fresh",
      checkedAt: now,
      refreshedAt: now,
      sourceHash: entry.hash,
      reason: "Source content refreshed from the current block index.",
    },
    unlinked: false,
  };
}

function refreshNodeFromEntry(
  node: SlideChildNode,
  entry: SourceBlockIndexEntry,
  now: string,
): { node: SlideChildNode; reason?: string } {
  if (entry.refresh.kind === "text") {
    const paragraph = paragraphFromEntry(node.id, entry);
    if (!paragraph)
      return { node, reason: "Text source payload is unavailable." };
    if (node.type === "text") {
      return {
        node: {
          ...node,
          content: { ...node.content, paragraphs: [paragraph] },
          source: refreshedSource(entry, now, node.source),
        },
      };
    }
    if (node.type === "shape") {
      const text: TextContent = { paragraphs: [paragraph] };
      return {
        node: {
          ...node,
          content: { ...node.content, text },
          source: refreshedSource(entry, now, node.source),
        },
      };
    }
    return {
      node,
      reason: "Text source can refresh only text or shape nodes.",
    };
  }

  if (entry.refresh.kind === "table") {
    if (node.type !== "table") {
      return { node, reason: "Table source can refresh only table nodes." };
    }
    const content: TableContent = {
      columns: entry.refresh.columns,
      rows: entry.refresh.rows,
      header: node.content.header ?? true,
      ...(entry.refresh.caption ? { caption: entry.refresh.caption } : {}),
    };
    return {
      node: {
        ...node,
        content,
        source: refreshedSource(entry, now, node.source),
      },
    };
  }

  if (entry.refresh.kind === "visual") {
    if (node.type !== "visual") {
      return { node, reason: "Visual source can refresh only visual nodes." };
    }
    return {
      node: {
        ...node,
        content: {
          ...node.content,
          visualId: entry.refresh.visualId,
          ...(entry.refresh.alt ? { alt: entry.refresh.alt } : {}),
        },
        source: refreshedSource(entry, now, node.source),
      },
    };
  }

  if (node.type !== "image") {
    return { node, reason: "Image source can refresh only image nodes." };
  }
  return {
    node: {
      ...node,
      content: {
        ...node.content,
        ...(entry.refresh.assetId ? { assetId: entry.refresh.assetId } : {}),
        ...(entry.refresh.alt ? { alt: entry.refresh.alt } : {}),
      },
      source: refreshedSource(entry, now, node.source),
    },
  };
}

export function refreshNodeSource(
  deck: DeckV7,
  slideId: string,
  nodeId: string,
  index: SourceBlockIndex,
  now: string,
): SourceRefreshResult {
  const slide = deck.slides.find((candidate) => candidate.id === slideId);
  const node = slide ? findNodeById(slide.children, nodeId) : undefined;
  const source = node?.source;
  if (!slide || !node || !source) {
    return {
      status: "skipped",
      deck,
      slideId,
      nodeId,
      reason: "Node has no source metadata.",
    };
  }
  if (source.unlinked === true) {
    return {
      status: "skipped",
      deck,
      slideId,
      nodeId,
      reason: "Node is explicitly unlinked.",
    };
  }
  if (source.documentId !== index.documentId) {
    return {
      status: "skipped",
      deck,
      slideId,
      nodeId,
      reason: "Cross-document source requires explicit remote resolution.",
    };
  }
  const block = findSourceBlock(index, source);
  if (!block) {
    return {
      status: "skipped",
      deck,
      slideId,
      nodeId,
      reason: "Source block is missing.",
    };
  }

  let skippedReason: string | undefined;
  const nextDeck = mapSlides(deck, (candidate) => {
    if (candidate.id !== slideId) return candidate;
    return {
      ...candidate,
      children: candidate.children.map((child) =>
        mapNodeById(child, nodeId, (target) => {
          const refreshed = refreshNodeFromEntry(target, block, now);
          skippedReason = refreshed.reason;
          return refreshed.node;
        }),
      ),
    };
  });
  if (skippedReason) {
    const checked = updateNodeSourceState(
      deck,
      slideId,
      nodeId,
      "unknown",
      now,
      skippedReason,
      block,
    );
    return {
      status: "skipped",
      deck: checked,
      slideId,
      nodeId,
      reason: skippedReason,
    };
  }
  return { status: "refreshed", deck: nextDeck, nodeId, slideId };
}

export function unlinkNodeSource(
  deck: DeckV7,
  slideId: string,
  nodeId: string,
  now: string,
): DeckV7 {
  return mapSlides(deck, (slide) => {
    if (slide.id !== slideId) return slide;
    return {
      ...slide,
      children: slide.children.map((child) =>
        mapNodeById(child, nodeId, (node) => {
          if (!node.source) return node;
          return {
            ...node,
            source: {
              ...node.source,
              unlinked: true,
              refresh: {
                state: "unlinked",
                checkedAt: now,
                reason: "Source dependency was explicitly unlinked.",
              },
            },
          } as SlideChildNode;
        }),
      ),
    };
  });
}

export function relinkNodeSource(
  deck: DeckV7,
  slideId: string,
  nodeId: string,
  entry: SourceBlockIndexEntry,
  now: string,
): SourceRefreshResult {
  const slide = deck.slides.find((candidate) => candidate.id === slideId);
  const node = slide ? findNodeById(slide.children, nodeId) : undefined;
  if (!slide || !node) {
    return {
      status: "skipped",
      deck,
      slideId,
      nodeId,
      reason: "Node was not found.",
    };
  }
  let skippedReason: string | undefined;
  const nextDeck = mapSlides(deck, (candidate) => {
    if (candidate.id !== slideId) return candidate;
    return {
      ...candidate,
      children: candidate.children.map((child) =>
        mapNodeById(child, nodeId, (target) => {
          const refreshed = refreshNodeFromEntry(target, entry, now);
          skippedReason = refreshed.reason;
          return skippedReason
            ? target
            : {
                ...refreshed.node,
                source: refreshedSource(entry, now, target.source),
              };
        }),
      ),
    };
  });
  if (skippedReason) {
    return { status: "skipped", deck, slideId, nodeId, reason: skippedReason };
  }
  return { status: "refreshed", deck: nextDeck, slideId, nodeId };
}

export function updateNodeSourceState(
  deck: DeckV7,
  slideId: string,
  nodeId: string,
  state: SourceRefreshState,
  now: string,
  reason: string,
  block?: SourceBlockIndexEntry,
): DeckV7 {
  return mapSlides(deck, (slide) => {
    if (slide.id !== slideId) return slide;
    return {
      ...slide,
      children: slide.children.map((child) =>
        mapNodeById(child, nodeId, (node) => {
          if (!node.source) return node;
          return {
            ...node,
            source: sourceWithRefresh(node.source, state, now, reason, block),
          } as SlideChildNode;
        }),
      ),
    };
  });
}

export function refreshAllSafeSourceLinks(
  deck: DeckV7,
  index: SourceBlockIndex,
  now: string,
): SourceRefreshAllResult {
  const classifications = classifyDeckSourceLinks(deck, index);
  let nextDeck = deck;
  const refreshed: SourceLinkClassification[] = [];
  const skipped: { item: SourceLinkClassification; reason: string }[] = [];
  for (const item of classifications) {
    if (item.state !== "stale") {
      if (item.state !== "fresh") {
        skipped.push({ item, reason: item.reason });
      }
      continue;
    }
    const result = refreshNodeSource(
      nextDeck,
      item.slideId,
      item.nodeId,
      index,
      now,
    );
    if (result.status === "refreshed") {
      nextDeck = result.deck;
      refreshed.push(item);
    } else {
      nextDeck = updateNodeSourceState(
        result.deck,
        item.slideId,
        item.nodeId,
        "unknown",
        now,
        result.reason,
        item.block,
      );
      skipped.push({ item, reason: result.reason });
    }
  }
  return { deck: nextDeck, refreshed, skipped };
}
