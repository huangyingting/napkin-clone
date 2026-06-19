-- AlterTable
ALTER TABLE "Document" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Document_slug_key" ON "Document"("slug");

