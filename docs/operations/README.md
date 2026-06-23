# Operations Docs

**Status:** Current  
**Last updated:** 2026-06-23

Operational docs cover deployment, runtime constraints, readiness checks, and
manual release procedures.

| Document                                                                             | Scope                                                                                             |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| [collab-deployment.md](collab-deployment.md)                                         | Yjs collaboration server deployment, authorization, durability window, and scaling options.       |
| [release-gate.md](release-gate.md)                                                   | Release readiness checklist and local/CI quality gate.                                            |
| [persisted-schema-migrations.md](persisted-schema-migrations.md)                     | Offline migration harness for forward-migrating persisted payloads (Epic #493, #502).             |
| [persisted-schema-repair.md](persisted-schema-repair.md)                             | Repair playbook: parse-failure telemetry, audit CLI, mirror rebuild, version restore (Epic #493). |
| [../security/api-route-security-matrix.md](../security/api-route-security-matrix.md) | API route classification, denial semantics, and abuse-control diagnostics (Epic #495).            |

## Rule Of Thumb

If a document describes how to run, deploy, verify, or release the system, it
belongs here rather than under `architecture/`.
