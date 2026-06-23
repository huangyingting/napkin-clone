# AGENTS.md

Project rules for AI coding agents.

## Rules

- Source code, tests, and schemas are authoritative; docs are background only.
- Do not add runtime compatibility layers for superseded payload shapes.
- When schemas change, update code, fixtures, tests, and docs to the current
  shape.
- Treat uncommitted changes as intentional; never revert user work unless asked.
- Keep edits scoped.
- Prefer existing local helpers and patterns over new abstractions.
- Use `rg` for searches.
- Read nearby implementation and tests before changing behavior.
- Prefer structured parsers/APIs over brittle string manipulation.
- Use `apply_patch` for manual file edits.
- Do not run destructive git commands, commit, or create branches unless asked.
- If editing docs, document current behavior only and update indexes/links.

## Verification

Before handoff/check-in, verify only the files touched by the change whenever that is reliable.

- Format modified/added files only, for example `npx prettier --write <files>`.
- Lint modified/added lintable files only, for example `npx eslint <files>`.
- Typecheck modified/added TypeScript files with the smallest reliable scope; if the change touches shared types, route files, generated Next types, or anything that cannot be checked file-by-file, run `npm run typecheck`.
- Run tests for modified/added test files, or the nearest focused tests covering modified code. Broaden only for shared behavior or cross-module contracts.

## Invariants

- `Document.contentJson` is the source of truth for document text and embedded
  visuals.
- `Visual` rows are a derived projection of visual nodes in `contentJson`.
- `Document.deckJson` is the source of truth for slides.
- Persisted decks must use the current deck schema version and carry
  `Slide.elements[]`.
- Render, export, and editor surfaces read slide elements directly.
- `BulletsElement.items[]` is authoritative for bullet elements.
- `SourceRef.blockKind` is required.
- Deck saves are guarded by revision-token compare-and-swap.
- Collaboration websocket upgrades require authorization.
