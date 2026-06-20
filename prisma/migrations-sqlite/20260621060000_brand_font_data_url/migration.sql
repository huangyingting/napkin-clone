-- Add durable font asset field to Brand (mirrors logoUrl for custom font uploads).
-- AlterTable
ALTER TABLE "Brand" ADD COLUMN "fontDataUrl" TEXT;
