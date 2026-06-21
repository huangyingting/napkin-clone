-- De-duplicate any existing (documentId, anchorBlockId) rows BEFORE adding the
-- unique index, so the index creation can't fail on legacy duplicates produced
-- by the previous non-transactional N+1 mirror. For each duplicate group we keep
-- the most recently created row (tie-break: lowest id) and delete the rest.
-- NULL anchors (the legacy document-level visual) are excluded — Postgres treats
-- NULLs as distinct, so they never collide.
DELETE FROM "Visual" v
USING "Visual" dup
WHERE v."documentId" = dup."documentId"
  AND v."anchorBlockId" = dup."anchorBlockId"
  AND v."anchorBlockId" IS NOT NULL
  AND (
    dup."createdAt" > v."createdAt"
    OR (dup."createdAt" = v."createdAt" AND dup."id" < v."id")
  );

-- CreateIndex
CREATE UNIQUE INDEX "Visual_documentId_anchorBlockId_key" ON "Visual"("documentId", "anchorBlockId");
