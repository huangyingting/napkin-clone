-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");
