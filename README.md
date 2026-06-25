# TextIQ

TextIQ is a text-to-visuals and slide-authoring app. It combines a Lexical
document editor, editable visual blocks, AI-assisted visual/deck generation,
presentation editing, sharing, export, workspaces, brand kits, and real-time
collaboration.

Built with **Next.js App Router**, **React**, **TypeScript**, **Prisma**,
**Lexical**, **Yjs**, and **Tailwind CSS**.

## Quick Start

The default local database is SQLite, so no database service is required.

```bash
cp .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev
```

Open [http://localhost:4000](http://localhost:4000).

`DB_PROVIDER` defaults to `sqlite`, and `DATABASE_URL` defaults to
`file:./prisma/dev.db` when unset. Copying `.env.example` is still recommended
because authentication needs `AUTH_SECRET`; use `openssl rand -base64 32` for a
real secret outside quick local testing.

## Scripts

| Script                     | Description                                                                  |
| -------------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`              | Start the Next app through `server.mjs` with inline collaboration enabled.   |
| `npm run build`            | Create a production build.                                                   |
| `npm run start`            | Run the production server.                                                   |
| `npm run collab`           | Run the standalone Yjs collaboration server.                                 |
| `npm test`                 | Run unit/pure tests under `src/**/*.test.ts` and `scripts/**/*.test.mjs`.    |
| `npm run test:e2e`         | Run Playwright E2E tests.                                                    |
| `npm run typecheck`        | Type-check with `tsc --noEmit`.                                              |
| `npm run lint`             | Run ESLint.                                                                  |
| `npm run format`           | Format the repository with Prettier.                                         |
| `npm run format:check`     | Check Prettier formatting.                                                   |
| `npm run db:generate`      | Regenerate the SQLite schema when selected, then generate the Prisma client. |
| `npm run db:schema:sqlite` | Regenerate `prisma/schema.sqlite.prisma` from the canonical schema.          |
| `npm run db:schema:check`  | Check the generated SQLite schema for drift.                                 |
| `npm run db:push`          | Regenerate the SQLite schema when selected, then apply it with `db push`.    |
| `npm run db:seed`          | Seed demo data.                                                              |
| `npm run db:reset`         | Regenerate Prisma, force-reset via `db push`, and seed.                      |

## Database

The database provider is selected with `DB_PROVIDER`:

| Provider   | Use                                                                     |
| ---------- | ----------------------------------------------------------------------- |
| `sqlite`   | Default for local development and tests.                                |
| `postgres` | Production-style deployment. Requires a `postgresql://` `DATABASE_URL`. |

During development, schemas are applied directly with `prisma db push`; migration
history is not maintained. Development data can be reset when schemas change.
`prisma/schema.prisma` is the only hand-edited schema. For SQLite, the tooling
mechanically regenerates `prisma/schema.sqlite.prisma` from it by changing only
the datasource provider.

The Prisma client is generated into `src/generated/prisma`, which is ignored by
git. Run `npm run db:generate` after installing dependencies or changing Prisma
schema files, and before `npm run typecheck`; typechecking imports the generated
client. CI also runs `npm run db:schema:check` before generating the client so a
stale committed SQLite schema fails fast.

Examples:

```bash
npm run db:push

DB_PROVIDER=postgres \
DATABASE_URL="postgresql://user:pass@localhost:5432/textiq?schema=public" \
npm run db:push
```

## Collaboration

The app server hosts the Yjs websocket endpoint inline at `/collab` by default,
so the browser can use the same origin/port as the app. The editor degrades to
local-only editing if the socket is unavailable.

To run collaboration separately:

```bash
npm run collab
COLLAB_INLINE=0 npm run dev
```

Then set `NEXT_PUBLIC_COLLAB_WS_URL` for the browser client. Production
deployment and scaling constraints are documented in
[docs/operations/collab-deployment.md](docs/operations/collab-deployment.md).

## Documentation

The documentation entry point is [docs/README.md](docs/README.md). Important
architecture contracts live under [docs/architecture/](docs/architecture/README.md):

| Area                        | Start here                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------ |
| System overview             | [docs/architecture/current-state.md](docs/architecture/current-state.md)             |
| AI generation               | [docs/architecture/ai/README.md](docs/architecture/ai/README.md)                     |
| Data models                 | [docs/architecture/data-model/README.md](docs/architecture/data-model/README.md)     |
| Editor architecture         | [docs/architecture/editor/README.md](docs/architecture/editor/README.md)             |
| Presentation runtime/export | [docs/architecture/presentation/README.md](docs/architecture/presentation/README.md) |
| Product/billing             | [docs/architecture/product/README.md](docs/architecture/product/README.md)           |
| Security and sharing        | [docs/architecture/security/README.md](docs/architecture/security/README.md)         |
| Commands and mutations      | [docs/architecture/commands/README.md](docs/architecture/commands/README.md)         |
| Operations                  | [docs/operations/README.md](docs/operations/README.md)                               |

Current schemas are authoritative during development. Do not add runtime
compatibility paths for superseded deck/visual/document payload shapes; update
fixtures, generators, and docs to the current shape instead.

## Project Structure

| Path              | Purpose                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| `src/app/`        | App Router pages, routes, and server actions.                                     |
| `src/components/` | React UI components.                                                              |
| `src/lib/`        | Domain logic, schemas, persistence helpers, AI, auth, billing, export, and tests. |
| `scripts/`        | Collaboration server and supporting Node scripts.                                 |
| `prisma/`         | Prisma schemas and seed script.                                                   |
| `e2e/`            | Playwright E2E tests.                                                             |
| `docs/`           | Current architecture and operations documentation.                                |

## Quality Gate

Before merging behavior changes, run the relevant checks:

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
```

For documentation-only changes, at minimum run:

```bash
npx prettier --check docs README.md AGENTS.md
```

See [docs/operations/release-gate.md](docs/operations/release-gate.md) for the
full release readiness checklist.
