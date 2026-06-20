# TextIQ — Text-to-Visuals Platform

Turn plain text into AI-generated, editable visuals (flowcharts, mind maps,
infographics, charts, and concept diagrams) with accounts, cloud documents,
exports, sharing, and real-time collaboration.

Built with **Next.js (App Router)**, **TypeScript**, and **Tailwind CSS**.

## Getting started

The app uses **SQLite by default** for zero-setup local development — there is no
database service to install or run. From a clean clone:

```bash
cp .env.example .env   # provides AUTH_SECRET + SQLite defaults
npm install            # postinstall generates the Prisma client (SQLite)
npm run db:migrate     # creates prisma/dev.db and applies migrations
npm run db:seed        # loads a demo user, document, and visual
npm run dev            # start the dev server
```

Open [http://localhost:4000](http://localhost:4000) to view the app.

The database steps need no configuration: `DB_PROVIDER` defaults to `sqlite` and
`DATABASE_URL` defaults to `file:./prisma/dev.db` when unset, so
`npm install && npm run db:migrate && npm run db:seed && npm run dev` brings the
app up on SQLite with no Postgres installed. Copying `.env.example` is recommended
because signing in requires `AUTH_SECRET` (replace the placeholder with
`openssl rand -base64 32` for anything beyond a quick look).

## Scripts

| Script                 | Description                               |
| ---------------------- | ----------------------------------------- |
| `npm run dev`          | Start the development server              |
| `npm run build`        | Create a production build                 |
| `npm run start`        | Run the production build                  |
| `npm run lint`         | Lint with ESLint (`eslint-config-next`)   |
| `npm run typecheck`    | Type-check with `tsc --noEmit`            |
| `npm run format`       | Format the codebase with Prettier         |
| `npm run format:check` | Verify formatting without writing changes |
| `npm run collab`       | Run the real-time collaboration server    |

## Database

The database engine is chosen at runtime by the **`DB_PROVIDER`** env var
(`sqlite` | `postgres`, default **`sqlite`** when unset):

- **Local dev/test — SQLite (default).** Zero setup: `npm run db:migrate` creates
  `prisma/dev.db`. `DATABASE_URL` is optional (defaults to `file:./prisma/dev.db`).
- **Production — PostgreSQL.** Switch by setting `DB_PROVIDER=postgres` and a
  `postgresql://` `DATABASE_URL`, then apply migrations with
  `DB_PROVIDER=postgres npm run db:deploy`.

All database scripts honor `DB_PROVIDER` (default SQLite):

| Script                | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `npm run db:generate` | Generate the Prisma client for the selected provider |
| `npm run db:migrate`  | Create/apply a dev migration (`prisma migrate dev`)  |
| `npm run db:deploy`   | Apply committed migrations (`prisma migrate deploy`) |
| `npm run db:seed`     | Seed demo data                                       |
| `npm run db:reset`    | Drop, re-migrate, and re-seed                        |

Prefix any command with `DB_PROVIDER=postgres` (and a `postgresql://`
`DATABASE_URL`) to target Postgres, e.g.:

```bash
DB_PROVIDER=postgres \
DATABASE_URL="postgresql://user:pass@localhost:5432/napkin?schema=public" \
npm run db:deploy
```

## Real-time collaboration

Collaborative editing is powered by a self-hosted Yjs websocket sync server. By
default the app server (`npm run dev` / `npm start`, via `server.mjs`) hosts that
socket **on the same port** at the `/collab` path, so the browser derives the
websocket URL from the page origin — a single forwarded port (e.g. VS Code port
forwarding or a reverse proxy) carries both the app and collaboration with no
extra configuration. The editor **degrades gracefully to local-only editing**
after 2.5 s if the socket is unreachable, and seeds its content from the
database (the durable source of truth), so collaboration is never a hard
dependency and the document is never blank.

To run collaboration as a separate process instead, start `npm run collab`
(default port 1234), set `COLLAB_INLINE=0` on the app server to disable the
inline socket, and point clients at it with `NEXT_PUBLIC_COLLAB_WS_URL`.

For running the server in production, the single-instance in-memory limitation,
and concrete scaling/persistence options (sticky routing, a Redis pub/sub
backplane, or a Yjs persistence adapter), see
[docs/collab-deployment.md](docs/collab-deployment.md).

## Project structure

```
src/app/        App Router routes, layout, and global styles
public/         Static assets
```

## Editor architecture

The document editor (Lexical rich text + editable visual blocks, context-aware
toolbars, and a data-driven tool registry) is documented in
[docs/editor-architecture.md](docs/editor-architecture.md) — read it before
adding a formatting tool, a visual kind, or a theme.

## Notes

This repository also hosts the Ralph autonomous-agent tooling (`scripts/ralph.sh`,
`scripts/prompt.md`, `scripts/prd.json`). Those files drive the iterative build and are not part
of the application itself.
