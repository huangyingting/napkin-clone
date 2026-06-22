-- CreateTable Asset (durable media storage for Slides, Epic #374)
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT,
    "workspaceId" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "checksum" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "originalName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_storageKey_key" ON "Asset"("storageKey");

-- CreateIndex
CREATE INDEX "Asset_documentId_idx" ON "Asset"("documentId");

-- CreateIndex
CREATE INDEX "Asset_workspaceId_idx" ON "Asset"("workspaceId");

-- CreateIndex
CREATE INDEX "Asset_checksum_idx" ON "Asset"("checksum");
