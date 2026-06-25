# TextIQ Documentation

**Status:** Current  
**Last updated:** 2026-06-25

This folder documents the current design of the TextIQ editor, visual mirror,
and slide deck system. The project is still in development, so these docs treat
the current schema as authoritative.

Database migration commands in README/package scripts are normal Prisma schema
workflow and are not runtime payload readers.

## Start Here

| Document                                             | Purpose                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| [system/current-state.md](system/current-state.md)   | System-wide runtime architecture and write paths.                               |
| [system/subsystem-map.md](system/subsystem-map.md)   | Code subsystem to documentation coverage map.                                   |
| [system/README.md](system/README.md)                 | Cross-subsystem contracts, invariants, naming, and ADR index.                   |
| [operations/README.md](operations/README.md)         | Deployment, release gates, and operational runbooks.                            |
| [editor/lexical-editor.md](editor/lexical-editor.md) | Lexical editor surfaces, tool registry, visual lifecycle, and deck autosave UX. |

## Subsystems

| Section                                   | Contains                                                  |
| ----------------------------------------- | --------------------------------------------------------- |
| [system/](system/README.md)               | System map, invariants, design system, naming, and ADRs.  |
| [ai/](ai/README.md)                       | AI-assisted generation contracts.                         |
| [auth/](auth/README.md)                   | Authentication, recovery, account settings, and deletion. |
| [collaboration/](collaboration/README.md) | Yjs room model, readiness, presence, and room access.     |
| [data-model/](data-model/README.md)       | Deck JSON and visual mirror contracts.                    |
| [documents/](documents/README.md)         | Document creation, listing, search, tags, and trash.      |
| [editor/](editor/README.md)               | Lexical editor and slide theme/layout architecture.       |
| [import/](import/README.md)               | Document import parsing, validation, and abuse controls.  |
| [localization/](localization/README.md)   | Typed catalogs, locale resolution, and activation gate.   |
| [presentation/](presentation/README.md)   | Slide editor runtime, present mode, and export pipeline.  |
| [product/](product/README.md)             | Brand styles, billing plans, and credits.                 |
| [public-render/](public-render/README.md) | Public share/embed/present/asset render resolution.       |
| [security/](security/README.md)           | Permissions, sharing, route matrix, and public surface.   |
| [visual/](visual/README.md)               | Visual schemas, kind registry, rendering, and export.     |
| [commands/](commands/README.md)           | Command envelope and mutation routing inventory.          |
| [diagnostics/](diagnostics/README.md)     | Logging scopes, diagnostic codes, and telemetry layers.   |
| [operations/](operations/README.md)       | Collaboration deployment and release readiness.           |

## Documentation Rules

- Document current behavior and current design only.
- Do not document superseded payload shapes as supported runtime behavior.
- When a schema is tightened, update the relevant contract document and tests in
  the same change.
- Prefer links to source files for implementation detail, but keep the docs
  readable without opening code.
- Material source behavior changes must amend the relevant ADR or supersede it
  with a new ADR; see the [ADR index](system/decisions.md).

## Verification

Before treating a docs update as done, run the relevant code checks when the
docs describe executable behavior:

```bash
npm run lint
npm run typecheck
npm test
npm run docs:check
```
