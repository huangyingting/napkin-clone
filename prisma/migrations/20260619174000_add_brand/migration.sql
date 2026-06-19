-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "palette" JSONB,
    "background" TEXT,
    "nodeFill" TEXT,
    "nodeStroke" TEXT,
    "nodeText" TEXT,
    "edgeColor" TEXT,
    "fontFamily" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Brand_ownerId_idx" ON "Brand"("ownerId");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
