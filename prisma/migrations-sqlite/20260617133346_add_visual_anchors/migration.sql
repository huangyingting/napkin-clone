-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Visual" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "anchorBlockId" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Visual_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Visual" ("createdAt", "data", "documentId", "id", "title", "type", "updatedAt") SELECT "createdAt", "data", "documentId", "id", "title", "type", "updatedAt" FROM "Visual";
DROP TABLE "Visual";
ALTER TABLE "new_Visual" RENAME TO "Visual";
CREATE INDEX "Visual_documentId_idx" ON "Visual"("documentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
