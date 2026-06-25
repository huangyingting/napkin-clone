# Documentation Coverage Map

**Status:** Current  
**Last updated:** 2026-06-26

This map ties the main code subsystems to their design documents. It is a
coverage index, not a replacement for source, tests, or schemas.

| Code subsystem                 | Primary source anchors                                                           | Design docs                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| System invariants and ADRs     | `src/lib/*`, `scripts/*`, `prisma/*`                                             | [current-state.md](current-state.md), [decisions.md](decisions.md)                                                        |
| Authentication and account     | `src/auth.ts`, `src/lib/auth/`, `src/lib/account/`                               | [../auth/](../auth/README.md), [../security/](../security/README.md)                                                      |
| Authorization and route policy | `src/lib/access-policy/`, `src/lib/auth/*permissions*`                           | [../security/](../security/README.md)                                                                                     |
| Collaboration runtime          | `src/lib/collab/`, `scripts/collab-*.mjs`                                        | [../collaboration/](../collaboration/README.md), [../operations/collab-deployment.md](../operations/collab-deployment.md) |
| Document management            | `src/lib/document-management/`, `src/lib/dashboard/`                             | [../documents/](../documents/README.md)                                                                                   |
| Document editor                | `src/lib/lexical/`, `src/app/app/documents/`                                     | [../editor/](../editor/README.md)                                                                                         |
| Document import                | `src/lib/import/`, `src/app/api/import/`                                         | [../import/](../import/README.md)                                                                                         |
| Data contracts and persistence | `src/lib/presentation/deck*`, `src/lib/visual/*mirror*`, `prisma/`               | [../data-model/](../data-model/README.md)                                                                                 |
| Visual system                  | `src/lib/visual/`, `src/components/visual/`                                      | [../visual/](../visual/README.md), [../data-model/visual-mirror.md](../data-model/visual-mirror.md)                       |
| Presentation editor/rendering  | `src/components/presentation/`, `src/lib/presentation/`                          | [../presentation/](../presentation/README.md)                                                                             |
| Public render surfaces         | `src/lib/public-render/`, `src/app/share/`, `src/app/embed/`, `src/app/present/` | [../public-render/](../public-render/README.md)                                                                           |
| AI generation                  | `src/lib/ai/`, `src/app/api/generate*`                                           | [../ai/](../ai/README.md)                                                                                                 |
| Commands and mutations         | `src/lib/commands/`, `src/lib/presentation/slide-commands*`                      | [../commands/](../commands/README.md)                                                                                     |
| Product, brand, and billing    | `src/lib/brand/`, `src/lib/brand-studio/`, `src/lib/billing/`                    | [../product/](../product/README.md)                                                                                       |
| Localization                   | `src/lib/i18n/`, `src/components/language-switcher.tsx`                          | [../localization/](../localization/README.md)                                                                             |
| Diagnostics and telemetry      | `src/lib/diagnostics/`, `src/lib/telemetry/`, `src/lib/log*`                     | [../diagnostics/](../diagnostics/README.md)                                                                               |
| Operations and release         | `scripts/`, `e2e/`, runtime env                                                  | [../operations/](../operations/README.md)                                                                                 |

## Coverage Rule

- A subsystem gets its own `docs/<subsystem>/README.md` when it has independent
  runtime contracts, data flow, or operational risk.
- A narrower concern is documented inside the owning subsystem when it is only a
  schema, route matrix, runbook, or implementation slice.
- Every docs subsystem directory stays flat: Markdown files live directly under
  `docs/<subsystem>/`.
