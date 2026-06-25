# Privacy DSAR Runbook

**Status:** Current  
**Last updated:** 2026-06-25

`src/lib/privacy/personal-data-inventory.ts` is the authoritative personal-data
inventory. Its drift test compares every Prisma model field in
`prisma/schema.prisma` to an explicit classification.

## Account export

`GET /api/account/export` returns export version 3. The JSON `manifest` lists
every export section required by the inventory:

- user profile
- documents, share policy, visuals, and versions
- owned workspaces and memberships
- authored comments and comment read state
- tags and brands
- asset display metadata only
- active subscription
- invite-link uses without invite tokens
- usage ledger entries

Raw asset bytes are not embedded in the JSON export. The export includes
sanitized display metadata so a recipient can identify protected assets without
copying blobs into the DSAR artifact.

## Account erasure

Account deletion removes FK-owned rows and explicitly purges non-FK identifiers:
`InviteLinkUse.userId`, `UsageLedgerEntry.userId`, and `RateLimitHit.subject`.
Owned asset storage keys are deleted before database rows are removed. After the
delete, erasure verification counts every inventoried user identifier and fails
closed if any residual personal data remains.

## Public share metadata

Public links default to `noindex,nofollow` and generic social metadata. Owners
can opt into search indexing and choose whether unfurls show only a generic
preview, the document title, or the title plus excerpt.
