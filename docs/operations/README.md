# Operations Docs

**Status:** Current  
**Last updated:** 2026-06-23

Operational docs cover deployment, runtime constraints, readiness checks, and
manual release procedures.

| Document                                                                             | Scope                                                                                       |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| [collab-deployment.md](collab-deployment.md)                                         | Yjs collaboration server deployment, authorization, durability window, and scaling options. |
| [release-gate.md](release-gate.md)                                                   | Release readiness checklist and local/CI quality gate.                                      |
| [../security/api-route-security-matrix.md](../security/api-route-security-matrix.md) | API route classification, denial semantics, and abuse-control diagnostics (Epic #495).      |

## Rule Of Thumb

If a document describes how to run, deploy, verify, or release the system, it
belongs here rather than under `architecture/`.
