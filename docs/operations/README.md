# Operations Docs

**Status:** Current  
**Last updated:** 2026-06-25

Operational docs cover deployment, runtime constraints, readiness checks, and
manual release procedures.

| Document                                                                             | Scope                                                                                               |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| [runtime-config.md](runtime-config.md)                                               | Environment-variable inventory across app, client, scripts, Prisma, and E2E tooling.                |
| [developer-bootstrap.md](developer-bootstrap.md)                                     | Local developer doctor/setup, worktree-safe development, local CI parity, and browser QA commands.  |
| [collab-deployment.md](collab-deployment.md)                                         | Yjs collaboration server deployment, authorization, durability window, and scaling options.         |
| [release-gate.md](release-gate.md)                                                   | Release readiness checklist and local/CI quality gate.                                              |
| [persisted-schema-repair.md](persisted-schema-repair.md)                             | Repair playbook: parse-failure telemetry, audit CLI, mirror rebuild, version restore (Epic #493).   |
| [privacy-dsar-runbook.md](privacy-dsar-runbook.md)                                   | Personal-data inventory, account export coverage, erasure verification, and public metadata policy. |
| [../security/api-route-security-matrix.md](../security/api-route-security-matrix.md) | API route classification, denial semantics, and abuse-control diagnostics (Epic #495).              |

## Rule Of Thumb

If a document describes how to run, deploy, verify, or release the system, it
belongs here rather than under a product subsystem.
