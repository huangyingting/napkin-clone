# Feedback Docs

**Status:** Current  
**Last updated:** 2026-06-28

Feedback docs capture QA findings, product feedback, and launch-readiness
follow-ups that do not yet belong to a single implementation subsystem. Source
code, tests, and schemas remain authoritative for current runtime behavior.

| Document                                                                                       | Scope                                                                                                    |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [pre-launch-feedback-2026-06-28.md](pre-launch-feedback-2026-06-28.md)                         | Pre-launch QA feedback, fixed code items, and remaining operational/product follow-ups.                  |
| [ui-audit-2026-06-27.md](ui-audit-2026-06-27.md)                                               | 20-sweep local UI audit covering public, authenticated, editor, workspace, and responsive flows.         |
| [ui-audit-repeat-20-browser-2026-06-27.md](ui-audit-repeat-20-browser-2026-06-27.md)           | Repeat 20-sweep browser audit using dev-browser across public, auth, app, editor, and mobile flows.      |
| [ui-audit-whole-app-real-20-2026-06-27.md](ui-audit-whole-app-real-20-2026-06-27.md)           | Whole-app real browser UI audit with 20 sweeps across public, auth, app, editor, and permissions.        |
| [ui-audit-intensive-whole-app-20-2026-06-27.md](ui-audit-intensive-whole-app-20-2026-06-27.md) | Intensive whole-app UI audit with 20 sweeps, broad button clicks, import/export, drag, and scale checks. |

When a feedback item is implemented, update the owning subsystem document if
the implementation changes current behavior or runtime contracts.
