# Security And Access Architecture

**Status:** Current  
**Last updated:** 2026-06-23

These documents describe authorization, public access, and share-link behavior.
They are the contract for routes and server actions that decide who may see or
mutate a document.

| Document                                       | Scope                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [access-and-sharing.md](access-and-sharing.md) | Document capabilities, workspace roles, public share/embed/present links, and route behavior. |
| [workspaces.md](workspaces.md)                 | Workspace roles, capabilities, invite links, member removal, and document handoff behavior.   |

## API Surface Governance

The HTTP attack surface is inventoried in the
[API route security matrix](../../security/api-route-security-matrix.md)
(Epic #495), which classifies every `src/app/api/**/route.ts` route, documents
its denial semantics, and is enforced by a guard test. Shared denial responses
come from `src/lib/api/errors.ts`; abuse-control diagnostics for the public
expensive endpoints come from `src/lib/diagnostics/api-abuse.ts`.

## Related Docs

- [../data-model/visual-mirror.md](../data-model/visual-mirror.md) for the
  projection public routes consume.
- [../../operations/collab-deployment.md](../../operations/collab-deployment.md)
  for WebSocket upgrade authorization.
- [../presentation/assets.md](../presentation/assets.md) for asset serving
  rules tied to shared documents.
