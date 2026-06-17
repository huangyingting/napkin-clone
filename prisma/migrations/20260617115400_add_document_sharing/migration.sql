-- AlterTable
ALTER TABLE "Document" ADD COLUMN "shareId" TEXT,
ADD COLUMN "isShared" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Document_shareId_key" ON "Document"("shareId");

-- CreateIndex
CREATE INDEX "Document_shareId_idx" ON "Document"("shareId");
