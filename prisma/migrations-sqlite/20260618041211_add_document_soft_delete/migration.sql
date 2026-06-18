-- AlterTable
ALTER TABLE "Document" ADD COLUMN "deletedAt" DATETIME;

-- CreateIndex
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");
