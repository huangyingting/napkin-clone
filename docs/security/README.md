# Security Operations Docs

**Status:** Current
**Last updated:** 2026-06-25

Operational, governance-facing security docs. These complement the
architecture-level access/sharing contracts under
[../architecture/security/](../architecture/security/README.md): where those
describe _how_ permissions are decided, the docs here inventory and govern the
HTTP attack surface.

| Document                                                     | Scope                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [api-route-security-matrix.md](api-route-security-matrix.md) | Authoritative classification of every `src/app/api/**/route.ts` route, enforced by a guard test. |
| [page-route-access-surface.md](page-route-access-surface.md) | Typed manifest for app/page surfaces, auth pages, share routes, and public proxy exclusions.     |

## Related

- Shared denial helper: `src/lib/api/errors.ts` (#511).
- Abuse-control diagnostics for public expensive endpoints:
  `src/lib/diagnostics/api-abuse.ts` (#512).
- [../operations/release-gate.md](../operations/release-gate.md) — release
  readiness gate.
