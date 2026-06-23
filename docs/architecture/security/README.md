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

## Related Docs

- [../data-model/visual-mirror.md](../data-model/visual-mirror.md) for the
  projection public routes consume.
- [../../operations/collab-deployment.md](../../operations/collab-deployment.md)
  for WebSocket upgrade authorization.
- [../presentation/assets.md](../presentation/assets.md) for asset serving
  rules tied to shared documents.
