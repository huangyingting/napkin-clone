# Operations Docs

**Type:** Runbook  
**Status:** Current  
**Last updated:** 2026-07-01

Operational docs cover deployment, runtime constraints, readiness checks, and
manual release procedures.

| Document                                                                             | Type      | Scope                                                                                               |
| ------------------------------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------- |
| [runtime-config.md](runtime-config.md)                                               | Reference | Environment-variable inventory across app, client, scripts, Prisma, and E2E tooling.                |
| [developer-bootstrap.md](developer-bootstrap.md)                                     | Runbook   | Local developer doctor/setup, worktree-safe development, local CI parity, and browser QA commands.  |
| [collab-deployment.md](collab-deployment.md)                                         | Runbook   | Yjs collaboration server deployment, authorization, durability window, and scaling options.         |
| [release-gate.md](release-gate.md)                                                   | Runbook   | Release readiness checklist and local/CI quality gate.                                              |
| [persisted-schema-repair.md](persisted-schema-repair.md)                             | Runbook   | Repair playbook: parse-failure telemetry, audit CLI, mirror rebuild, version restore (Epic #493).   |
| [resource-limits.md](resource-limits.md)                                             | Contract  | Central limit inventory for import, AI, deck persistence, assets, documents, and timing budgets.    |
| [privacy-dsar-runbook.md](privacy-dsar-runbook.md)                                   | Runbook   | Personal-data inventory, account export coverage, erasure verification, and public metadata policy. |
| [../security/api-route-security-matrix.md](../security/api-route-security-matrix.md) | Reference | API route classification, denial semantics, and abuse-control diagnostics (Epic #495).              |

## Rule Of Thumb

If a document describes how to run, deploy, verify, or release the system, it
belongs here rather than under a product subsystem.
