-- CreateTable CommentRead (per-user read state for a document's comments, #160)
CREATE TABLE "CommentRead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "lastReadAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommentRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommentRead_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CommentRead_documentId_idx" ON "CommentRead"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentRead_userId_documentId_key" ON "CommentRead"("userId", "documentId");
