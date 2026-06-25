import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

import bcrypt from "bcryptjs";

import { Prisma } from "../src/generated/prisma/client";
import { safeParseDeck } from "../src/lib/presentation/deck-schema";
import { deriveStorageKey } from "../src/lib/slides/asset-storage";
import {
  VISUAL_KIND_TO_PRISMA,
  safeParseVisual,
} from "../src/lib/visual/schema";
import {
  E2E_PROFILE_FIXTURE,
  buildE2EProfileContentJson,
  buildE2EProfileDeck,
  buildE2EProfileFixtureDescriptor,
  buildE2EProfileVisual,
  fixtureAssetChecksum,
  fixturePngBuffer,
} from "../src/test/builders/e2e-profile";
import { createScriptPrismaClient } from "./script-prisma-client";

/**
 * Deterministic E2E seed (Epic #517, issue #518).
 *
 * Creates a fixed owner + viewer user (passwords hashed via the same bcrypt
 * path the app uses), a workspace granting the viewer read-only access, and a
 * single document with:
 *   - an intro paragraph + embedded VisualNode in `contentJson`,
 *   - a persisted `deckJson` (current schema version) whose first slide carries
 *     known title/body text and an ImageElement backed by a slide Asset,
 *   - an enabled public share policy (fixed shareId + slug, present + embed),
 *   - one slide image `Asset` whose bytes are written to local storage so the
 *     protected `/api/slide-assets/…` route resolves real bytes.
 *
 * Every identifier is the constant from `e2e/helpers/profile.ts`, so the seed
 * and the Playwright specs share one source of truth. After a successful run it
 * emits `e2e/.e2e-fixture.json` describing the produced fixture.
 *
 * Idempotent: safe to re-run (and after `prisma db push --force-reset`).
 */

const prisma = createScriptPrismaClient();

const F = E2E_PROFILE_FIXTURE;

async function writeAssetBytes(
  storageKey: string,
  bytes: Buffer,
): Promise<void> {
  const dest = path.join(process.cwd(), "storage", "slide-assets", storageKey);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, bytes);
}

async function main() {
  // -------------------------------------------------------------------------
  // 1. Users — owner + viewer, passwords hashed with bcrypt (cost 12, matching
  //    src/app/signup/actions.ts) so the Credentials provider authenticates.
  // -------------------------------------------------------------------------
  const ownerHash = await bcrypt.hash(F.owner.password, 12);
  const viewerHash = await bcrypt.hash(F.viewer.password, 12);
  const now = new Date();

  const owner = await prisma.user.upsert({
    where: { email: F.owner.email },
    update: { passwordHash: ownerHash, name: F.owner.name, emailVerified: now },
    create: {
      email: F.owner.email,
      name: F.owner.name,
      passwordHash: ownerHash,
      emailVerified: now,
    },
  });

  const viewer = await prisma.user.upsert({
    where: { email: F.viewer.email },
    update: {
      passwordHash: viewerHash,
      name: F.viewer.name,
      emailVerified: now,
    },
    create: {
      email: F.viewer.email,
      name: F.viewer.name,
      passwordHash: viewerHash,
      emailVerified: now,
    },
  });

  // -------------------------------------------------------------------------
  // 2. Workspace — owned by the owner, with the viewer as a VIEWER member so
  //    the viewer has read-only document capability.
  // -------------------------------------------------------------------------
  await prisma.workspace.upsert({
    where: { id: F.workspaceId },
    update: { ownerId: owner.id, name: "E2E Fixture Workspace" },
    create: {
      id: F.workspaceId,
      ownerId: owner.id,
      name: "E2E Fixture Workspace",
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: { workspaceId: F.workspaceId, userId: viewer.id },
    },
    update: { role: "VIEWER" },
    create: { workspaceId: F.workspaceId, userId: viewer.id, role: "VIEWER" },
  });

  // -------------------------------------------------------------------------
  // 3. Visual — embedded into the document's contentJson as a VisualNode.
  // -------------------------------------------------------------------------
  const visual = buildE2EProfileVisual();
  const parsedVisual = safeParseVisual(visual);
  if (!parsedVisual.success) {
    throw new Error(`Fixture visual failed validation: ${parsedVisual.error}`);
  }
  const visualData = parsedVisual.data as unknown as Prisma.InputJsonValue;

  // -------------------------------------------------------------------------
  // 4. Slide asset — write bytes + create/refresh the Asset row.
  // -------------------------------------------------------------------------
  const pngBytes = fixturePngBuffer();
  const checksum = fixtureAssetChecksum(pngBytes);
  const storageKey = deriveStorageKey(F.documentId, checksum, "image/png");
  await writeAssetBytes(storageKey, pngBytes);
  const assetUrl = `/api/slide-assets/${storageKey}`;

  // -------------------------------------------------------------------------
  // 5. Document — create/refresh with share policy, contentJson, and deckJson.
  //    Done in two steps so the embedded visual id is stable and the Asset can
  //    be linked to the document.
  // -------------------------------------------------------------------------
  const contentJson = buildE2EProfileContentJson(
    parsedVisual.data,
  ) as unknown as Prisma.InputJsonValue;

  await prisma.document.upsert({
    where: { id: F.documentId },
    update: {
      title: F.documentTitle,
      content: F.documentBodyText,
      contentJson,
      ownerId: owner.id,
      workspaceId: F.workspaceId,
      shareId: F.shareId,
      slug: F.slug,
      isShared: true,
      shareEmbedEnabled: true,
      sharePresentEnabled: true,
      shareExpiresAt: null,
      deletedAt: null,
    },
    create: {
      id: F.documentId,
      title: F.documentTitle,
      content: F.documentBodyText,
      contentJson,
      ownerId: owner.id,
      workspaceId: F.workspaceId,
      shareId: F.shareId,
      slug: F.slug,
      isShared: true,
      shareEmbedEnabled: true,
      sharePresentEnabled: true,
    },
  });

  // Visual row (derived projection of the embedded VisualNode).
  await prisma.visual.upsert({
    where: { id: F.visualId },
    update: {
      documentId: F.documentId,
      type: VISUAL_KIND_TO_PRISMA[parsedVisual.data.type],
      title: parsedVisual.data.title ?? null,
      data: visualData,
    },
    create: {
      id: F.visualId,
      documentId: F.documentId,
      type: VISUAL_KIND_TO_PRISMA[parsedVisual.data.type],
      title: parsedVisual.data.title ?? null,
      data: visualData,
    },
  });

  const asset = await prisma.asset.upsert({
    where: { storageKey },
    update: {
      documentId: F.documentId,
      workspaceId: F.workspaceId,
      mimeType: "image/png",
      byteSize: pngBytes.byteLength,
      checksum,
      originalName: "fixture.png",
      deletedAt: null,
    },
    create: {
      documentId: F.documentId,
      workspaceId: F.workspaceId,
      mimeType: "image/png",
      byteSize: pngBytes.byteLength,
      checksum,
      storageKey,
      originalName: "fixture.png",
    },
    select: { id: true },
  });

  // Persist the deck once the asset id is known so the ImageElement carries a
  // real `assetId`. Validated through safeParseDeck so a broken deck fails loud.
  const rawDeck = buildE2EProfileDeck(assetUrl, asset.id);
  const parsedDeck = safeParseDeck(rawDeck);
  if (!parsedDeck.success) {
    throw new Error(`Fixture deck failed validation: ${parsedDeck.error}`);
  }
  const deck = parsedDeck.data;
  await prisma.document.update({
    where: { id: F.documentId },
    data: { deckJson: deck as unknown as Prisma.InputJsonValue },
  });

  // -------------------------------------------------------------------------
  // 5b. PRIVATE document + asset — never shared. Used to assert that anonymous
  //     and unrelated requests to a private slide asset are denied (403/404),
  //     in contrast to the shared document above.
  // -------------------------------------------------------------------------
  const privateStorageKey = deriveStorageKey(
    F.privateDocumentId,
    checksum,
    "image/png",
  );
  await writeAssetBytes(privateStorageKey, pngBytes);

  await prisma.document.upsert({
    where: { id: F.privateDocumentId },
    update: {
      title: "E2E Private Fixture",
      content: "Private fixture document (never shared).",
      ownerId: owner.id,
      workspaceId: null,
      isShared: false,
      shareId: null,
      slug: null,
      deletedAt: null,
    },
    create: {
      id: F.privateDocumentId,
      title: "E2E Private Fixture",
      content: "Private fixture document (never shared).",
      ownerId: owner.id,
      isShared: false,
    },
  });

  await prisma.asset.upsert({
    where: { storageKey: privateStorageKey },
    update: {
      documentId: F.privateDocumentId,
      workspaceId: null,
      mimeType: "image/png",
      byteSize: pngBytes.byteLength,
      checksum,
      originalName: "fixture.png",
      deletedAt: null,
    },
    create: {
      documentId: F.privateDocumentId,
      mimeType: "image/png",
      byteSize: pngBytes.byteLength,
      checksum,
      storageKey: privateStorageKey,
      originalName: "fixture.png",
    },
  });

  // -------------------------------------------------------------------------
  // 6. Emit the fixture descriptor for transparency / debugging.
  // -------------------------------------------------------------------------
  const fixtureOut = buildE2EProfileFixtureDescriptor({
    assetId: asset.id,
    assetPath: assetUrl,
    privateAssetPath: `/api/slide-assets/${privateStorageKey}`,
    seededAt: now.toISOString(),
  });
  await fs.writeFile(
    path.join(process.cwd(), "e2e", ".e2e-fixture.json"),
    `${JSON.stringify(fixtureOut, null, 2)}\n`,
  );

  console.log(
    `Seeded E2E profile: owner "${owner.email}", viewer "${viewer.email}", ` +
      `document "${F.documentId}" (share ${F.shareId}, slug ${F.slug}), ` +
      `asset ${asset.id} (${pngBytes.byteLength} bytes at ${storageKey}). ` +
      `Fixture written to e2e/.e2e-fixture.json.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
