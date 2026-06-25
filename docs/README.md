# TextIQ Documentation

**Status:** Current  
**Last updated:** 2026-06-25

This folder documents the current design of the TextIQ editor, visual mirror,
and slide deck system. The project is still in development, so these docs treat
the current schema as authoritative.

Database migration commands in README/package scripts are normal Prisma schema
workflow and are not runtime payload readers.

## Start Here

| Document                                                                       | Purpose                                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [architecture/current-state.md](architecture/current-state.md)                 | System-wide runtime architecture and write paths.                               |
| [architecture/README.md](architecture/README.md)                               | Architecture contracts grouped by data model, editor, and commands.             |
| [operations/README.md](operations/README.md)                                   | Deployment, release gates, and operational runbooks.                            |
| [architecture/editor/lexical-editor.md](architecture/editor/lexical-editor.md) | Lexical editor surfaces, tool registry, visual lifecycle, and deck autosave UX. |

## Architecture Topics

| Section                                                           | Contains                                                 |
| ----------------------------------------------------------------- | -------------------------------------------------------- |
| [architecture/ai/](architecture/ai/README.md)                     | AI-assisted generation contracts.                        |
| [architecture/data-model/](architecture/data-model/README.md)     | Deck JSON and visual mirror contracts.                   |
| [architecture/editor/](architecture/editor/README.md)             | Lexical editor and slide theme/layout architecture.      |
| [architecture/presentation/](architecture/presentation/README.md) | Slide editor runtime, present mode, and export pipeline. |
| [architecture/product/](architecture/product/README.md)           | Brand styles, billing plans, and credits.                |
| [architecture/security/](architecture/security/README.md)         | Permissions, public sharing, and protected asset access. |
| [architecture/commands/](architecture/commands/README.md)         | Command envelope and mutation routing inventory.         |
| [architecture/diagnostics/](architecture/diagnostics/README.md)   | Logging scopes, diagnostic codes, and telemetry layers.  |
| [architecture/decisions/](architecture/decisions/README.md)       | Architecture Decision Records and supersession rules.    |
| [security/](security/README.md)                                   | API route security matrix and public-surface governance. |
| [operations/](operations/README.md)                               | Collaboration deployment and release readiness.          |

## Documentation Rules

- Document current behavior and current design only.
- Do not document superseded payload shapes as supported runtime behavior.
- When a schema is tightened, update the relevant contract document and tests in
  the same change.
- Prefer links to source files for implementation detail, but keep the docs
  readable without opening code.
- Material source behavior changes must amend the relevant ADR or supersede it
  with a new ADR; see the [ADR index](architecture/decisions/README.md).

## Verification

Before treating a docs update as done, run the relevant code checks when the
docs describe executable behavior:

```bash
npm run lint
npm run typecheck
npm test
npm run docs:check
```
