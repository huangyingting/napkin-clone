-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "content" TEXT NOT NULL DEFAULT '',
    "ownerId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "shareId" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Document_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Document_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("content", "createdAt", "deletedAt", "id", "isShared", "ownerId", "shareId", "title", "updatedAt", "workspaceId") SELECT "content", "createdAt", "deletedAt", "id", "isShared", "ownerId", "shareId", "title", "updatedAt", "workspaceId" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
CREATE UNIQUE INDEX "Document_shareId_key" ON "Document"("shareId");
CREATE INDEX "Document_ownerId_idx" ON "Document"("ownerId");
CREATE INDEX "Document_workspaceId_idx" ON "Document"("workspaceId");
CREATE INDEX "Document_shareId_idx" ON "Document"("shareId");
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
