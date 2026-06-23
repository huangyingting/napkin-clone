# Data Model Contracts

**Status:** Current  
**Last updated:** 2026-06-23

These documents define persisted JSON contracts and database projections. They
are the first place to update when a schema or source-of-truth boundary changes.

| Document                             | Scope                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| [deck.md](deck.md)                   | Current `Document.deckJson` shape, slide elements, source refs, sync, and deck persistence. |
| [visual-mirror.md](visual-mirror.md) | Projection from Lexical visual nodes in `contentJson` to `Visual` rows.                     |

## Rules

- Current schemas are authoritative.
- Runtime render/export paths consume current payloads directly.
- Obsolete payload shapes are not documented as supported contracts.
