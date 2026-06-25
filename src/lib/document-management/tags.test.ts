import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addDocumentTag,
  disconnectDocumentTag,
  findOrCreateDocumentTag,
  type DocumentTag,
} from "./tags";

function p2002(): Error & { code: string } {
  return Object.assign(new Error("unique constraint"), { code: "P2002" });
}

type FakeTag = DocumentTag & { ownerId: string };

function toDocumentTag(tag: FakeTag): DocumentTag {
  return { id: tag.id, name: tag.name, slug: tag.slug };
}

function createFakeDb(initialTags: FakeTag[] = []) {
  const tags = [...initialTags];
  const documentTags: DocumentTag[] = [];
  const createCalls: string[] = [];
  let failNextCreate: (() => void) | null = null;

  return {
    tags,
    documentTags,
    createCalls,
    failCreateOnce(callback: () => void) {
      failNextCreate = callback;
    },
    db: {
      tag: {
        async findFirst({
          where,
        }: {
          where: { ownerId: string; name: string };
        }): Promise<DocumentTag | null> {
          const tag = tags.find(
            (candidate) =>
              candidate.ownerId === where.ownerId &&
              candidate.name === where.name,
          );
          return tag ? toDocumentTag(tag) : null;
        },
        async create({
          data,
        }: {
          data: { ownerId: string; name: string; slug: string };
        }): Promise<DocumentTag> {
          createCalls.push(data.slug);
          if (failNextCreate) {
            const callback = failNextCreate;
            failNextCreate = null;
            callback();
            throw p2002();
          }
          if (
            tags.some(
              (tag) => tag.ownerId === data.ownerId && tag.name === data.name,
            ) ||
            tags.some(
              (tag) => tag.ownerId === data.ownerId && tag.slug === data.slug,
            )
          ) {
            throw p2002();
          }
          const tag = { id: `tag-${tags.length + 1}`, ...data };
          tags.push(tag);
          return toDocumentTag(tag);
        },
      },
      document: {
        async findUnique(): Promise<{ tags: DocumentTag[] }> {
          return {
            tags: [...documentTags].sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
          };
        },
        async update({
          data,
        }: {
          data: {
            tags: { connect: { id: string } } | { disconnect: { id: string } };
          };
        }): Promise<void> {
          const tagChange = data.tags;
          if ("connect" in tagChange) {
            const tag = tags.find(
              (candidate) => candidate.id === tagChange.connect.id,
            );
            if (
              tag &&
              !documentTags.some((existing) => existing.id === tag.id)
            ) {
              documentTags.push(toDocumentTag(tag));
            }
            return;
          }
          const index = documentTags.findIndex(
            (tag) => tag.id === tagChange.disconnect.id,
          );
          if (index >= 0) documentTags.splice(index, 1);
        },
      },
    },
  };
}

test("findOrCreateDocumentTag reuses an existing owner-scoped tag by normalized name", async () => {
  const fake = createFakeDb([
    { id: "tag-1", ownerId: "user-1", name: "Design", slug: "design" },
  ]);

  const tag = await findOrCreateDocumentTag("user-1", "  Design  ", fake.db);

  assert.deepEqual(tag, { id: "tag-1", name: "Design", slug: "design" });
  assert.deepEqual(fake.createCalls, []);
});

test("findOrCreateDocumentTag uses deterministic slug retry on collisions", async () => {
  const fake = createFakeDb([
    { id: "tag-1", ownerId: "user-1", name: "Existing", slug: "design" },
    { id: "tag-2", ownerId: "user-1", name: "Existing 2", slug: "design-2" },
  ]);

  const tag = await findOrCreateDocumentTag("user-1", "Design", fake.db);

  assert.deepEqual(fake.createCalls, ["design", "design-2", "design-3"]);
  assert.deepEqual(tag, { id: "tag-3", name: "Design", slug: "design-3" });
});

test("findOrCreateDocumentTag recovers the winning same-name row after a race", async () => {
  const fake = createFakeDb();
  fake.failCreateOnce(() => {
    fake.tags.push({
      id: "winner",
      ownerId: "user-1",
      name: "Roadmap",
      slug: "roadmap",
    });
  });

  const tag = await findOrCreateDocumentTag("user-1", "Roadmap", fake.db);

  assert.deepEqual(tag, { id: "winner", name: "Roadmap", slug: "roadmap" });
  assert.deepEqual(fake.createCalls, ["roadmap"]);
});

test("addDocumentTag creates and connects a document tag", async () => {
  const fake = createFakeDb();

  const tags = await addDocumentTag("doc-1", "user-1", "Launch Plan", fake.db);

  assert.deepEqual(tags, [
    { id: "tag-1", name: "Launch Plan", slug: "launch-plan" },
  ]);
});

test("addDocumentTag treats blank normalized names as a no-op", async () => {
  const fake = createFakeDb([
    { id: "tag-1", ownerId: "user-1", name: "Design", slug: "design" },
  ]);

  const tags = await addDocumentTag("doc-1", "user-1", "   ", fake.db);

  assert.deepEqual(tags, []);
  assert.deepEqual(fake.createCalls, []);
});

test("disconnectDocumentTag disconnects without deleting the tag row", async () => {
  const fake = createFakeDb([
    { id: "tag-1", ownerId: "user-1", name: "Design", slug: "design" },
  ]);
  await addDocumentTag("doc-1", "user-1", "Design", fake.db);

  const tags = await disconnectDocumentTag("doc-1", "tag-1", fake.db);

  assert.deepEqual(tags, []);
  assert.equal(fake.tags.length, 1);
});
