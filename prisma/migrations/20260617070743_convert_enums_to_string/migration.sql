-- Convert the Postgres enum columns to TEXT (data-preserving) so the schema is
-- portable across SQLite and Postgres, then drop the now-unused enum types.
-- The defaults reference the enum type, so drop them before the cast and re-add
-- the equivalent text default afterwards.

-- WorkspaceMember.role: "WorkspaceRole" -> TEXT
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" SET DATA TYPE TEXT USING ("role"::text);
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" SET DEFAULT 'VIEWER';

-- InviteLink.role: "WorkspaceRole" -> TEXT
ALTER TABLE "InviteLink" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "InviteLink" ALTER COLUMN "role" SET DATA TYPE TEXT USING ("role"::text);
ALTER TABLE "InviteLink" ALTER COLUMN "role" SET DEFAULT 'VIEWER';

-- Visual.type: "VisualType" -> TEXT (no default)
ALTER TABLE "Visual" ALTER COLUMN "type" SET DATA TYPE TEXT USING ("type"::text);

-- DropEnum
DROP TYPE "VisualType";
DROP TYPE "WorkspaceRole";
