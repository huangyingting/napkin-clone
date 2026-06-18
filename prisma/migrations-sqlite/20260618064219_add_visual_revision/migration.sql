-- CreateTable
CREATE TABLE "VisualRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "visualId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisualRevision_visualId_fkey" FOREIGN KEY ("visualId") REFERENCES "Visual" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "VisualRevision_visualId_idx" ON "VisualRevision"("visualId");
