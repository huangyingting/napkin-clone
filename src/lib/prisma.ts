import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { resolveProvider, resolveUrl } from "@/lib/db-provider";

function createPrismaClient() {
  if (resolveProvider() === "postgres") {
    const connectionString = resolveUrl();

    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set.");
    }

    const adapter = new PrismaPg({ connectionString });

    return new PrismaClient({ adapter });
  }

  // SQLite: resolveUrl() returns DATABASE_URL when set, else the local-file default.
  const url = resolveUrl()!;

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
