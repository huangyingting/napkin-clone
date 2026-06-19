-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "palette" TEXT,
    "background" TEXT,
    "nodeFill" TEXT,
    "nodeStroke" TEXT,
    "nodeText" TEXT,
    "edgeColor" TEXT,
    "fontFamily" TEXT,
    "logoUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Brand_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Brand_ownerId_idx" ON "Brand"("ownerId");
