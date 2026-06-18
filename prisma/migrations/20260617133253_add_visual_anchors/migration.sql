-- AlterTable
ALTER TABLE "Visual" ADD COLUMN     "anchorBlockId" TEXT,
ADD COLUMN     "orderIndex" INTEGER NOT NULL DEFAULT 0;
