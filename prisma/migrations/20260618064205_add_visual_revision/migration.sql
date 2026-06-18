-- CreateTable
CREATE TABLE "VisualRevision" (
    "id" TEXT NOT NULL,
    "visualId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisualRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisualRevision_visualId_idx" ON "VisualRevision"("visualId");

-- AddForeignKey
ALTER TABLE "VisualRevision" ADD CONSTRAINT "VisualRevision_visualId_fkey" FOREIGN KEY ("visualId") REFERENCES "Visual"("id") ON DELETE CASCADE ON UPDATE CASCADE;
