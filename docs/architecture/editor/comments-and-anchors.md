# Comments And Anchors

**Status:** Current  
**Last updated:** 2026-06-23

This document describes comment threads and their document/slide anchors.

## Source Files

| Area                    | Source                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Comment actions         | [`src/app/app/documents/[id]/comments-actions.ts`](../../../src/app/app/documents/%5Bid%5D/comments-actions.ts)                   |
| Comment permissions     | [`src/app/app/documents/[id]/comment-permissions.ts`](../../../src/app/app/documents/%5Bid%5D/comment-permissions.ts)             |
| Anchor validation       | [`src/app/app/documents/[id]/comment-anchor-validation.ts`](../../../src/app/app/documents/%5Bid%5D/comment-anchor-validation.ts) |
| Inline comments UI      | [`src/app/app/documents/[id]/inline-comments-layer.tsx`](../../../src/app/app/documents/%5Bid%5D/inline-comments-layer.tsx)       |
| Slide comment panel     | [`src/app/app/documents/[id]/slide-comment-panel.tsx`](../../../src/app/app/documents/%5Bid%5D/slide-comment-panel.tsx)           |
| Slide anchor helpers    | [`src/lib/presentation/slide-comment-anchors.ts`](../../../src/lib/presentation/slide-comment-anchors.ts)                         |
| Slide lifecycle helpers | [`src/app/app/documents/[id]/slide-comment-lifecycle.ts`](../../../src/app/app/documents/%5Bid%5D/slide-comment-lifecycle.ts)     |
| Unread helpers          | [`src/app/app/documents/[id]/slide-comment-unread.ts`](../../../src/app/app/documents/%5Bid%5D/slide-comment-unread.ts)           |

## Comment Thread Model

Comments are one-level threads:

- root comment owns anchor and resolved state;
- replies point at the root comment and inherit its anchor;
- list actions return roots with their replies sorted oldest-to-newest.

Creating or listing comments requires document `view` capability.

Editing and deleting a comment requires authorship. Resolving threads is handled
through the comment action layer and returns refreshed server truth.

## Anchor Types

Top-level comments may be anchored in two ways.

| Anchor                      | Fields                                                     | Meaning                                                    |
| --------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| Text/visual document anchor | `anchorType`, `anchorText`, `anchorNodeId`                 | Anchors to document text selection or visual node context. |
| Slide anchor                | `slideId`, optional `elementId`, optional `{x,y}` geometry | Anchors to a deck slide or slide element.                  |

Slide anchors are mutually exclusive with text/visual anchor fields. If
`slideId` is present, text/visual anchor fields are ignored.

## Slide Anchor Geometry

Slide geometry is a point in percent units relative to the slide canvas:

```ts
type AnchorPoint = { x: number; y: number };
```

Validation requires both coordinates to be finite and within `0..100`.
`elementId` is accepted only when `slideId` is present.

## Slide Lifecycle Behavior

Slide lifecycle helpers keep anchors coherent when slides/elements change:

- deleting a slide can orphan anchors that pointed to it;
- deleting an element can orphan element-level anchors while preserving the
  slide-level relationship;
- duplicating a slide does not copy comments to the new slide;
- restore/version flows can surface orphaned anchors for the UI.

The lifecycle layer is pure and does not write the database directly.

## Filters And UI

`listComments` supports:

- `slideId` filter;
- `anchorScope: "all" | "text" | "slide"`.

The document editor uses inline comment surfaces for text/visual anchors. The
slide editor uses slide comment panels and anchor state helpers for slide-level
comments.

Unread helpers compute per-comment/thread read state for slide comment surfaces.

## Invariants

1. Comment list/create requires document view capability.
2. Edit/delete requires comment authorship.
3. Replies do not define their own anchors.
4. Slide anchors use percent geometry.
5. Slide duplication does not copy comments.
6. Lifecycle helpers are pure; server actions own persistence.

## Primary Tests

- [`src/app/app/documents/[id]/comment-anchor-validation.test.ts`](../../../src/app/app/documents/%5Bid%5D/comment-anchor-validation.test.ts)
- [`src/app/app/documents/[id]/comment-permissions.test.ts`](../../../src/app/app/documents/%5Bid%5D/comment-permissions.test.ts)
- [`src/app/app/documents/[id]/slide-comment-lifecycle.test.ts`](../../../src/app/app/documents/%5Bid%5D/slide-comment-lifecycle.test.ts)
- [`src/app/app/documents/[id]/slide-comment-permissions-lifecycle.test.ts`](../../../src/app/app/documents/%5Bid%5D/slide-comment-permissions-lifecycle.test.ts)
- [`src/app/app/documents/[id]/slide-comment-unread.test.ts`](../../../src/app/app/documents/%5Bid%5D/slide-comment-unread.test.ts)
- [`src/lib/presentation/slide-comment-anchors.test.ts`](../../../src/lib/presentation/slide-comment-anchors.test.ts)
