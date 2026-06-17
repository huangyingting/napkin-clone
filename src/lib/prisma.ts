import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

// Mirror prisma.config.ts: anything other than the exact string "postgres"
// selects SQLite, the zero-setup default for local dev/test.
function resolveProvider(): "postgres" | "sqlite" {
  return process.env.DB_PROVIDER === "postgres" ? "postgres" : "sqlite";
}

function createPrismaClient() {
  if (resolveProvider() === "postgres") {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set.");
    }

    const adapter = new PrismaPg({ connectionString });

    return new PrismaClient({ adapter });
  }

  // SQLite: DATABASE_URL wins when set; otherwise fall back to a local file so a
  // fresh clone works with no configuration.
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

  const adapter = new PrismaBetterSqlite3({ url });

  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
