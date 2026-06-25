/**
 * Canonical domain identity vocabulary.
 *
 * These aliases are type-only and zero-runtime-cost. They document durable ids
 * without changing persisted payload shapes; use them at new adapter boundaries
 * where distinguishing durable ids from transient editor keys prevents mistakes.
 */

type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

/** Durable `Document.id` database id. */
export type DocumentId = Brand<string, "DocumentId">;

/** Durable document block `bid` / `blockId` stored in `contentJson`. */
export type DocumentBlockId = Brand<string, "DocumentBlockId">;

/**
 * Live Lexical `NodeKey`. Transient only: never persist or send as a durable
 * anchor/source-ref id.
 */
export type LexicalNodeKey = Brand<string, "LexicalNodeKey">;

/** Durable visual identity (`Visual.id` / visual node `visualId`). */
export type VisualId = Brand<string, "VisualId">;

/** Durable slide id persisted in `Document.deckJson`. */
export type SlideId = Brand<string, "SlideId">;

/** Durable slide element id persisted in `Slide.elements[]`. */
export type SlideElementId = Brand<string, "SlideElementId">;

/** Durable uploaded asset row id. */
export type AssetId = Brand<string, "AssetId">;

/** Durable workspace id. */
export type WorkspaceId = Brand<string, "WorkspaceId">;

/** Durable user id. */
export type UserId = Brand<string, "UserId">;
