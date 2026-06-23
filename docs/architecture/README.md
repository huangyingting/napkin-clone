# Architecture Docs

**Status:** Current  
**Last updated:** 2026-06-23

These documents describe live architecture contracts. If a design changes during
development, update the relevant contract so it continues to describe the
current system.

## Overview

| Document                             | Scope                                                   |
| ------------------------------------ | ------------------------------------------------------- |
| [current-state.md](current-state.md) | End-to-end system architecture and source-of-truth map. |

## Contract Groups

| Group                                  | Documents                                                    |
| -------------------------------------- | ------------------------------------------------------------ |
| [ai](ai/README.md)                     | AI generation request flow and validation contracts.         |
| [data-model](data-model/README.md)     | Deck JSON and visual mirror contracts.                       |
| [editor](editor/README.md)             | Lexical editor surfaces and slide theme/layout architecture. |
| [presentation](presentation/README.md) | Slide editor runtime, present mode, and export pipeline.     |
| [product](product/README.md)           | Brand styles, billing plans, and credits.                    |
| [security](security/README.md)         | Permissions, public sharing, and protected asset access.     |
| [commands](commands/README.md)         | Command envelope and mutation routing inventory.             |

Operational material lives under [../operations/](../operations/README.md).

## Current Invariants

- `Document.contentJson` is the source of truth for document text and embedded
  visuals.
- `Visual` rows are a derived projection of visual nodes in `contentJson`.
- `Document.deckJson` is the source of truth for slides.
- Persisted decks must use the current deck schema version and carry
  `Slide.elements[]`.
- Render, export, and editor surfaces read slide elements directly; they do not
  synthesize old slide shapes at runtime.
- Deck saves are guarded by revision-token compare-and-swap.
- Collaboration websocket upgrades require authorization.

## Schema Policy

The current design assumes development data can be regenerated or discarded when
schemas change. Document the current payload shape, not superseded shapes.
