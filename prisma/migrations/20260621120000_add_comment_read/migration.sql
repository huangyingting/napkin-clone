-- CreateTable CommentRead (per-user read state for a document's comments, #160)
CREATE TABLE "CommentRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommentRead_documentId_idx" ON "CommentRead"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentRead_userId_documentId_key" ON "CommentRead"("userId", "documentId");

-- AddForeignKey
ALTER TABLE "CommentRead" ADD CONSTRAINT "CommentRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentRead" ADD CONSTRAINT "CommentRead_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
