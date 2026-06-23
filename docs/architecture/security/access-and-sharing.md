# Access Control And Public Sharing

**Status:** Current  
**Last updated:** 2026-06-23

This document defines document-level access control and public share behavior.
It covers authenticated app permissions, public share/embed/present routes, and
collaboration upgrade authorization.

## Source Files

| Area                    | Source                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| Document capabilities   | [`src/lib/auth/document-permissions.ts`](../../../src/lib/auth/document-permissions.ts)       |
| Workspace role coercion | [`src/lib/workspace/roles.ts`](../../../src/lib/workspace/roles.ts)                           |
| Share access policy     | [`src/lib/share-access.ts`](../../../src/lib/share-access.ts)                                 |
| Share route             | [`src/app/share/[shareId]/page.tsx`](../../../src/app/share/%5BshareId%5D/page.tsx)           |
| Embed route             | [`src/app/embed/[shareId]/page.tsx`](../../../src/app/embed/%5BshareId%5D/page.tsx)           |
| Present route           | [`src/app/present/[shareId]/page.tsx`](../../../src/app/present/%5BshareId%5D/page.tsx)       |
| Collab authorize route  | [`src/app/api/collab/authorize/route.ts`](../../../src/app/api/collab/authorize/route.ts)     |
| Share actions           | [`src/app/app/documents/[id]/actions.ts`](../../../src/app/app/documents/%5Bid%5D/actions.ts) |

## Authenticated Document Roles

`deriveDocumentRole` resolves a user's effective role for one document from:

1. document ownership;
2. workspace ownership;
3. workspace membership role.

| Role     | Source                                              | Capabilities       |
| -------- | --------------------------------------------------- | ------------------ |
| `owner`  | Document owner, workspace owner, or `OWNER` member. | view, edit, manage |
| `editor` | `EDITOR` workspace member.                          | view, edit         |
| `viewer` | `VIEWER` workspace member.                          | view               |
| `none`   | No relationship.                                    | none               |

Capabilities are intentionally coarse:

- `view`: read the document, comment, duplicate, join read-only collab;
- `edit`: mutate title/body/deck/tags/favorite and upload slide assets;
- `manage`: share settings, delete, restore, invite/member administration.

Server actions call `requireDocumentCapability(userId, documentId,
capability)`. A user with no view access receives a not-found style error so the
action does not reveal private document existence.

## Public Share Access

Public routes do not use workspace membership. They evaluate a pure share policy
from `src/lib/share-access.ts`.

The route supplies:

- requested `shareId` from the URL segment;
- stored `Document.shareId`;
- `Document.isShared`;
- `Document.deletedAt`;
- `Document.shareExpiresAt`;
- `Document.shareEmbedEnabled`;
- `Document.sharePresentEnabled`;
- requested mode: `view`, `embed`, or `present`.

The request is denied when the document is not shared, the requested id no
longer matches, the document is deleted, the link is expired, or the requested
mode is disabled.

| Route                      | Mode      | Output                                 |
| -------------------------- | --------- | -------------------------------------- |
| `/share/[shareId]`         | `view`    | Read-only Lexical document.            |
| `/embed/[shareId]`         | `embed`   | Embeddable read-only document surface. |
| `/present/[shareId]`       | `present` | Public presentation viewer.            |
| `/present/[shareId]/embed` | `present` | Embeddable public presentation viewer. |

Denied requests become `notFound()` or no-index metadata. Private titles or
content must not leak through metadata.

## Share Link Lifecycle

Share actions live in the document server actions module.

| Action                  | Effect                                                       |
| ----------------------- | ------------------------------------------------------------ |
| `toggleDocumentSharing` | Enables/disables sharing and creates a share id when needed. |
| `regenerateShareLink`   | Rotates `shareId`; previous URLs stop resolving.             |
| `updateSharePolicy`     | Updates expiry and embed/present enablement.                 |

Public URLs may include a decorative slug, but the stable authorization key is
the `shareId` extracted from the segment.

## Collaboration Authorization

Collaboration websocket upgrades are authorized before the WebSocket handshake.
The authorize route maps document capability to collab behavior:

| Capability | Collab connection               |
| ---------- | ------------------------------- |
| none       | upgrade refused                 |
| `view`     | accepted read-only              |
| `edit`     | accepted with update permission |

The collab server also enforces read-only behavior by dropping update messages
from viewer connections.

## Invariants

1. All authenticated document actions resolve capabilities through the shared
   permission helper.
2. Public routes use the shared pure share policy.
3. Share metadata must not leak private document content when access is denied.
4. Regenerating a share link invalidates old URLs immediately.
5. Collaboration upgrades require authorization.

## Primary Tests

- [`src/lib/auth/document-permissions.test.ts`](../../../src/lib/auth/document-permissions.test.ts)
- [`src/lib/auth/authz-regression.test.ts`](../../../src/lib/auth/authz-regression.test.ts)
- [`src/lib/auth/document-role-matrix.test.ts`](../../../src/lib/auth/document-role-matrix.test.ts)
- [`src/lib/share-access.test.ts`](../../../src/lib/share-access.test.ts)
- [`src/lib/collab/room-access.test.ts`](../../../src/lib/collab/room-access.test.ts)
- [`e2e/public-pages.spec.ts`](../../../e2e/public-pages.spec.ts)
- [`e2e/share-fallback.spec.ts`](../../../e2e/share-fallback.spec.ts)
