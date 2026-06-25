import assert from "node:assert/strict";
import test from "node:test";

import { validateSchemaContractMetadata } from "./gen-sqlite-schema.mjs";

test("schema drift gate requires persisted-contract metadata", () => {
  const valid = `
    // Point-in-time snapshot of a document's editable state
    model DocumentVersion {
      contentJson Json
      deckJson Json?
    }
    // The slug derives from slugify(name)
    model Tag {
      slug String
      @@unique([ownerId, slug])
    }
    model WorkspaceMember { role String @default("VIEWER") }
    model InviteLink { role String @default("VIEWER") }
    model InviteLinkUse { role String }
    model Comment {
      // Slide-level anchor fields
      anchorType String?
      anchorNodeId String?
      anchorGeometry Json?
    }
    model Asset {
      // Scope: an asset may be owned by a document, workspace, or brand.
      documentId String?
      workspaceId String?
      brandId String?
    }
  `;

  assert.deepEqual(validateSchemaContractMetadata(valid), []);

  const missing = validateSchemaContractMetadata(
    valid.replace("anchorGeometry Json?", ""),
  );
  assert.deepEqual(missing, ["Comment anchor persisted columns"]);
});
