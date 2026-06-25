/** Source reference model and helpers. */

/**
 * Provenance metadata linking an inserted slide element back to a source
 * document block for sync and staleness tracking.
 */
export interface SourceRef {
  documentId: string;
  blockId: string;
  /** Hash of the source content at insertion time, used for staleness checks. */
  contentHash?: string;
  /** ISO timestamp describing when the source link was established. */
  linkedAt: string;
  /** True when the user explicitly broke the source link. */
  unlinked?: boolean;
  /** Kind of source block this ref points to. */
  blockKind: "text" | "visual";
}

type SourceRefCarrier = { sourceRef?: SourceRef };

function cloneSourceRef(ref: SourceRef): SourceRef {
  return {
    documentId: ref.documentId,
    blockId: ref.blockId,
    ...(ref.contentHash !== undefined ? { contentHash: ref.contentHash } : {}),
    linkedAt: ref.linkedAt,
    ...(ref.unlinked === true ? { unlinked: true } : {}),
    blockKind: ref.blockKind,
  };
}

function cloneLinkedSourceRef(ref: SourceRef): SourceRef {
  const { unlinked: _unlinked, ...linkedRef } = ref;
  return cloneSourceRef(linkedRef);
}

/** Returns true when an element still has an active source link. */
export function isSourceLinked(el: SourceRefCarrier): boolean {
  return el.sourceRef !== undefined && el.sourceRef.unlinked !== true;
}

/**
 * Returns true when an element's linked source content has changed since the
 * element was inserted or last relinked.
 */
export function isSourceStale(
  el: SourceRefCarrier,
  currentHash: string,
): boolean {
  const contentHash = el.sourceRef?.contentHash;
  return (
    isSourceLinked(el) &&
    typeof contentHash === "string" &&
    contentHash !== currentHash
  );
}

/** Marks an element's source link as intentionally broken. */
export function unlinkSource<T extends SourceRefCarrier>(el: T): T {
  if (el.sourceRef === undefined || el.sourceRef.unlinked === true) {
    return el;
  }
  return {
    ...el,
    sourceRef: {
      ...cloneSourceRef(el.sourceRef),
      unlinked: true,
    },
  };
}

/** Replaces an element's source link with a fresh active reference. */
export function relinkSource<T extends SourceRefCarrier>(
  el: T,
  ref: SourceRef,
): T {
  return {
    ...el,
    sourceRef: cloneLinkedSourceRef(ref),
  };
}
