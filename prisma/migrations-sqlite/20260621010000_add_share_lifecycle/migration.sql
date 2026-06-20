-- AlterTable: share-link lifecycle & access policy (issue #101)
ALTER TABLE "Document" ADD COLUMN "shareExpiresAt" DATETIME;
ALTER TABLE "Document" ADD COLUMN "shareEmbedEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Document" ADD COLUMN "sharePresentEnabled" BOOLEAN NOT NULL DEFAULT true;
