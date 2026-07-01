---
type: "adr"
status: "accepted"
last_updated: "2026-07-01"
description: "Architecture decision record for realtime collaboration scaling, durability, WebSocket room lifecycle, persistence, eviction, flood controls, and operational constraints."
---

# 1. Realtime collaboration scaling and durability

- **Status:** Accepted
- **Date:** 2026-06-23
- **Epic:** #492 — Collaboration Durability and Realtime Operations Hardening
- **Supersedes:** —
- **Superseded by:** —

## Context

TextIQ real-time collaboration (US-019) runs the y-websocket wire protocol over
an in-memory `Map<roomId, Y.Doc>` (`scripts/collab-core.mjs`), hosted either
inline on the Next.js server (`server.mjs`, dev / single-port forwarding) or as a
standalone process (`scripts/collab-server.mjs`). Authorization is delegated to
`/api/collab/authorize`; the **application database remains the canonical
content store** via the editor's client autosave into `Document.contentJson`.

Two limits motivate this decision:

1. **Volatility.** Rooms live only in process memory. A restart, deploy, or crash
   drops every room; edits inside the last autosave debounce window and all live
   presence are lost. Issue #492 added a best-effort eviction **recovery
   snapshot** (`onBeforeEvict` → `/api/collab/flush` → `Document.collabRecovery*`)
   that narrows — but does not close — the loss window, and is explicitly **not**
   the source of truth.
2. **Single-instance ceiling.** Because room state is per-process, two instances
   serving the same document diverge. Horizontal scale / HA requires either
   pinning a room to one instance or sharing room state across instances.

This ADR records how we will scale realtime beyond one instance and make room
state survive restarts. It complements the operator-facing comparison in
[docs/operations/collaboration-deployment.md](../operations/collaboration-deployment.md).

## Options

### Option A — Sticky routing (no new dependency)

Route every websocket for a given room to the same instance via consistent
hashing on the document id (load-balancer sticky sessions). Guarded by
`COLLAB_INSTANCE_COUNT=N` + `COLLAB_STICKY_ROUTING=1`.

- **Pros:** zero code change, no new infra; immediate capacity scale-out.
- **Cons:** a single hot document still cannot exceed one instance; a node
  failure drops its rooms (clients reconnect and re-seed from the DB); uneven
  load when a few documents are very busy. Does **not** add durability.

### Option B — Redis pub/sub backplane

Keep in-memory rooms; add a per-room Redis pub/sub channel. Each instance
publishes applied Yjs updates and rebroadcasts updates it receives (awareness
fanned out the same way).

- **Pros:** clients on any instance converge — no sticky routing needed; Redis is
  the only new dependency.
- **Cons:** adds a broadcast hop of latency and an operational dependency; state
  is **still volatile** unless paired with persistence — a cold instance holds no
  room until a client connects and re-seeds from the DB.

### Option C — y-redis (durable + shareable)

A maintained Yjs persistence provider that uses Redis for **both** persistence
**and** pub/sub fan-out — effectively Option B plus durability in one package.

- **Pros:** room state survives restarts; horizontal scale and fan-out together;
  Redis is the only added dependency; pairs naturally with the canonical DB
  content store.
- **Cons:** more moving parts; CRDT update logs grow and need
  compaction/snapshotting; the adapter must match the server's `yjs` /
  `y-protocols` versions to avoid wire skew.

### Option D — y-leveldb (single durable node)

File-backed Yjs persistence for one always-on node: rooms survive restarts.

- **Pros:** lightest durability upgrade; no external service.
- **Cons:** **single node only** — does not share state across instances, so it
  does not provide HA or horizontal scale.

### Option E — Custom Postgres adapter

Persist Yjs update binaries into the Postgres we already run.

- **Pros:** no new infrastructure; one datastore to operate.
- **Cons:** we own store / merge / compaction / fan-out logic; highest
  engineering and maintenance cost; easy to get CRDT compaction subtly wrong.

## Decision

- **Multi-instance / HA:** adopt **`y-redis` (Option C)**. It delivers Option B's
  fan-out and durability together with Redis as the only added dependency, and is
  the most production-ready path for a horizontally-scaled deployment.
- **Single durable node:** adopt **`y-leveldb` (Option D)** as the lightest way to
  make a single always-on node survive restarts.
- **Quick stopgap:** **sticky routing (Option A)** remains the no-dependency way
  to add capacity (not durability) while the above is implemented.

We explicitly reject a **custom Postgres adapter (Option E)** as the primary path:
the maintenance cost of owning CRDT compaction outweighs the "one datastore"
benefit when `y-redis` / `y-leveldb` are maintained and battle-tested.

In every option the **application database stays canonical** (editor autosave →
`contentJson`). The Yjs layer is a low-latency, conflict-free transport plus
short-term history — not the system of record — so a collab-layer failure never
loses a saved document.

## Consequences

- A new operational dependency (Redis) for the HA path, with its own monitoring,
  sizing, and failure modes.
- CRDT update logs must be compacted/snapshotted on a schedule.
- The persistence adapter's `yjs` / `y-protocols` versions are pinned to the
  server's to avoid wire-protocol skew (already an invariant for the in-memory
  core).
- The eviction recovery snapshot (#497) becomes redundant for deployments that
  adopt a durable adapter, but remains valuable for the in-memory default; it
  stays as a best-effort safety net.

## What remains volatile after the change

- **Live presence / awareness** is never persisted — it is rebuilt from connected
  clients after any restart, by design.
- With **sticky routing only**, room _content_ is still volatile on node loss
  (clients re-seed from the DB).
- With **`y-leveldb`**, content survives restarts on that node but is **not**
  shared across instances — no HA.
- Edits accepted in the brief window between an update being applied in memory and
  being persisted/replicated remain at risk until the durable write confirms.

## Migration

1. Pin and add the chosen adapter (`y-redis` for HA, `y-leveldb` for single node)
   matching the server's `yjs` / `y-protocols` versions.
2. Replace the in-memory room hydration in `scripts/collab-core.mjs` with the
   adapter's bind/load, keeping the existing authorize and eviction flow.
3. For `y-redis`, stand up Redis and wire pub/sub fan-out; set the multi-instance
   deployment guard env (`COLLAB_INSTANCE_COUNT`, drop the sticky requirement once
   fan-out is verified).
4. Add a compaction/snapshot job for the update log.
5. Roll out behind config so the in-memory default keeps working unchanged.

## Rollback

The adapter is additive. To roll back, disable the persistence binding and revert
to the in-memory `Map` (the current default) — the canonical `contentJson` store
is unaffected, so no document content is lost. For `y-redis`, drain connections,
switch instances back to in-memory mode, then decommission Redis.

## Cost

- **`y-redis`:** one managed Redis instance (small/medium), plus engineering for
  binding, fan-out wiring, and compaction. Ongoing: Redis ops + log growth.
- **`y-leveldb`:** disk on the single node, near-zero external cost; no HA.
- **Sticky routing:** no infra cost; load-balancer config only.

## First implementation issue

**"Adopt y-redis persistence + pub/sub behind COLLAB_PERSISTENCE flag"** — add the
version-matched `y-redis` binding to `scripts/collab-core.mjs` behind an opt-in
env flag, stand up Redis in staging, verify cross-instance convergence and
restart-survival with an integration test, and add a compaction job. The
in-memory default remains the fallback until the flag is proven in production.
