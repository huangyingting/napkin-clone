# AGENTS.md

Project rules for AI coding agents.

## Rules

- Source code, tests, and schemas are authoritative; docs are background only.
- Do not add runtime compatibility layers for superseded payload shapes.
- When schemas change, update code, fixtures, tests, and docs to the current shape.
- Treat uncommitted changes as intentional; never revert user work unless asked.
- Keep edits scoped.
- Prefer existing local helpers and patterns over new abstractions.
- Read nearby implementation and tests before changing behavior.
- Prefer structured parsers/APIs over brittle string manipulation.
- Do not run destructive git commands, commit, or create branches unless asked.
- If editing docs, document current behavior only; keep docs in flat `docs/<subsystem>/` directories and update indexes when coverage changes.

## Verification

Before handoff/check-in, verify only the files touched by the change whenever that is reliable.

- Format modified/added files only, for example `npx prettier --write <files>`.
- Lint modified/added lintable files only, for example `npx eslint <files>`.
- Typecheck modified/added TypeScript files with the smallest reliable scope; if the change touches shared types, route files, generated Next types, or anything that cannot be checked file-by-file, run `npm run typecheck`.
- Prefer subsystem-focused tests, for example `npm run test:subsystem -- <subsystem>`, before broadening to the full test suite; add `--with-e2e` only when the mapped E2E coverage is relevant.
- Run tests for modified/added test files, or the nearest focused tests covering modified code. Broaden only for shared behavior or cross-module contracts.
