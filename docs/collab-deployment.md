# Collaboration server — deployment & scaling

Real-time collaborative editing (multiple cursors, presence, conflict-free
merges) is powered by a self-hosted Yjs websocket sync server,
[`scripts/collab-server.mjs`](../scripts/collab-server.mjs). The browser editor
connects to it through the [`useCollaboration`](../src/lib/collab/use-collaboration.ts)
hook.

This document describes how to run that server in production, its current
single-instance limitation, and concrete options for scaling and persistence.

> **No application change is required to read this document.** It explains the
> existing behavior and the upgrade paths; the app already degrades gracefully to
> local-only editing when the server is unreachable (see
> [Graceful degradation](#graceful-degradation)).

## What the server does

- Implements the canonical y-websocket wire protocol (`messageSync` /
  `messageAwareness` / `messageQueryAwareness`) against the **same** `yjs` /
  `y-protocols` / `lib0` versions the browser client uses, so there is no
  protocol/version skew.
- Holds **one in-memory `Y.Doc` ("room") per document id**. Clients connect to
  `ws://host:port/<documentId>` — the path segment is the room name.
- Tracks presence (awareness) per room and relays it to the other clients.
- Exposes a plain-HTTP `GET /health` endpoint returning
  `{ "ok": true, "rooms": <number> }` for liveness/readiness probes.
- Keeps a room in memory after its last client disconnects, so a reconnecting
  client re-syncs without a round-trip to the database.

It is **runtime tooling, not part of the Next.js bundle** — it runs as its own
Node process alongside the web app.

## Running it in production

```bash
# From the repo root, with production env vars set:
COLLAB_PORT=1234 npm run collab
# (equivalent to: node scripts/collab-server.mjs)
```

Recommended production setup:

1. **Run it under a process manager** (systemd, pm2, or a container) so it
   restarts on crash. Use `GET /health` as the liveness/readiness check.
2. **Terminate TLS at a reverse proxy.** The server speaks plain `ws://`; put it
   behind nginx / Caddy / a cloud load balancer that upgrades the connection and
   serves `wss://`. Browsers on an HTTPS page **must** use a `wss://` URL.
3. **Point the app at it** with `NEXT_PUBLIC_COLLAB_WS_URL` (see the table below).
   Because it is a `NEXT_PUBLIC_*` variable, it is inlined into the client bundle
   **at build time** — set it before `npm run build`, not just at runtime.

### Environment reference

| Variable                    | Read by                 | Default               | Description                                                                                                |
| --------------------------- | ----------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `COLLAB_PORT`               | collab server           | `1234`                | TCP port the websocket + `/health` HTTP server listens on.                                                 |
| `COLLAB_HOST`               | collab server           | `0.0.0.0`             | Bind address. Keep `0.0.0.0` behind a reverse proxy; narrow it if the proxy is on the same host.           |
| `NEXT_PUBLIC_COLLAB_WS_URL` | browser editor (client) | `ws://localhost:1234` | WebSocket URL the editor connects to. Use `wss://collab.example.com` in production. Inlined at build time. |

`COLLAB_PORT` / `COLLAB_HOST` configure the server process;
`NEXT_PUBLIC_COLLAB_WS_URL` configures the client. In production they describe
the two ends of the **same** endpoint (the public `wss://` URL terminates at the
proxy, which forwards to `COLLAB_HOST:COLLAB_PORT`).

## Graceful degradation

The editor never blocks on the collaboration server:

- `useCollaboration` creates the `Y.Doc` eagerly and connects the websocket
  provider in an effect. If the provider has **not** reported an initial sync
  within `DEGRADED_TIMEOUT_MS` (**2.5 s**), the hook flips `ready` to `true`
  anyway via a `degraded` flag, so editing is enabled in **local-only** mode.
- The connection pill in the UI reflects the state (`Live` / `Connecting…` /
  `Offline`).
- When the server later becomes reachable, the provider reconnects and the
  client re-syncs; offline edits merge via the CRDT.
- **The database is the durable source of truth.** Text, title, and the selected
  visual autosave to the app database through debounced server actions
  independent of the collab server, so a server outage degrades collaboration to
  single-user editing without data loss.

This means a misconfigured or down collaboration server is a **soft failure**:
users keep editing; they just don't see each other in real time until it
recovers.

## Single-instance, in-memory limitation

The server stores every room's `Y.Doc` in a **process-local `Map`** (`const docs
= new Map()`). That state is never written to disk and never shared with other
processes. Two consequences follow:

1. **It does not scale horizontally as-is.** If you run more than one instance
   behind a load balancer, two clients editing the **same** document but
   connected to **different** instances each get a separate in-memory room and
   will **not** see each other's edits or presence. A single hot document is
   capped at the throughput of one instance.
2. **Room state is volatile.** A restart, crash, or deploy drops all in-memory
   rooms. This is largely masked by the app's database autosave (a fresh client
   re-seeds the room from the DB), but any edits still inside the last debounce
   window and all live presence are lost on restart, and clients cannot merge
   through the server while a room is being rebuilt.

For a single instance these limits are usually fine — a vertically-scaled node
plus the DB autosave safety net covers typical team usage. They only bite when
you need **multiple instances** (high availability or load) or **durable collab
state** across restarts.

## Scaling and persistence options

Listed from least to most involved. Pick based on whether you need horizontal
scale, durability, or both.

### Option A — Sticky routing (no new dependency)

Route every websocket connection for a given room to the **same** instance, using
the load balancer's consistent hashing on the document id in the URL path (or
sticky sessions). One instance owns a room, so the existing in-memory sync keeps
working across a fleet.

- **Pros:** zero code change and no new infrastructure; immediate way to run more
  than one instance for capacity.
- **Cons:** a single hot document still can't exceed one instance; if a node
  fails its rooms are dropped (clients reconnect and re-seed from the DB); load
  can be uneven if a few documents are very busy.

### Option B — Shared pub/sub backplane (Redis)

Keep the in-memory rooms but add a per-room Redis **pub/sub** channel. When an
instance applies a Yjs update it publishes the binary update to Redis; every
instance subscribed to that room applies and rebroadcasts it to its own clients
(awareness is fanned out the same way).

- **Pros:** clients on **any** instance converge, so no sticky routing is needed;
  Redis is the only new dependency.
- **Cons:** adds a small broadcast hop of latency and an operational dependency;
  state is **still volatile** unless combined with persistence — a cold instance
  with no clients holds no room until one connects and re-seeds from the DB.

### Option C — Yjs persistence adapter (durable, and shareable)

Replace or augment the in-memory `Map` with a Yjs **persistence provider** that
stores each room's update log durably and (depending on the adapter) fans it out
across instances:

- **[`y-redis`](https://github.com/yjs/y-redis)** — uses Redis for **both**
  persistence **and** pub/sub fan-out. This is essentially Option B **plus**
  durability in one maintained package, and is the most production-ready path for
  a horizontally-scaled deployment.
- **[`y-leveldb`](https://github.com/yjs/y-leveldb)** — file-backed persistence
  for a **single** durable node: rooms survive restarts, but it does **not** share
  state across instances. Good for one always-on node that must not lose collab
  state on deploy.
- **A custom Postgres adapter** — persist Yjs update binaries to the database we
  already run in production. Keeps the stack lean, at the cost of owning the
  store/merge/compaction logic yourself.

- **Pros:** room state survives restarts; with `y-redis` you also get horizontal
  scale; pairs naturally with the existing DB content store.
- **Cons:** more moving parts; you store CRDT update logs that grow and need
  periodic compaction/snapshotting; the adapter must match the server's
  `yjs`/`y-protocols` versions to avoid skew.

### Recommendation

- **Multi-instance / HA:** adopt **`y-redis`** (Option C). It delivers the pub/sub
  fan-out of Option B and durability together, with Redis as the only added
  dependency.
- **Single durable node:** **`y-leveldb`** (Option C) is the lightest upgrade.
- **Quick multi-instance stopgap:** **sticky routing** (Option A) needs no new
  dependency.

In every option the **application database remains the canonical content store**
(via the editor's autosave). The Yjs layer is a low-latency, conflict-free
transport plus short-term history — not the system of record — so a collab-layer
failure never loses a saved document.
