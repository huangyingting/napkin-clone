import assert from "node:assert/strict";
import { test } from "node:test";

import { CURRENT_DECK_SCHEMA_VERSION } from "./deck";
import { safeParseDeck } from "./deck-schema";

function baseDeck(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    masters: [
      {
        id: "master-default",
        name: "Default Master",
        background: { type: "solid", color: { token: "slideBg" } },
        elements: [
          {
            id: "footer",
            kind: "text",
            role: "footer",
            masterChromeKind: "footer",
            layer: "foreground",
            locked: true,
            zIndex: 0,
            box: { x: 6, y: 92, w: 88, h: 4 },
            content: {
              kind: "text",
              text: "Confidential",
              paragraphs: [{ text: "Confidential" }],
            },
          },
        ],
      },
    ],
    defaultMasterId: "master-default",
    slides: [
      {
        id: "s1",
        index: 0,
        title: "Slide 1",
        elements: [],
      },
    ],
    ...overrides,
  };
}

test("deck with a valid v6 master is accepted", () => {
  const result = safeParseDeck(baseDeck());
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal((result.data as any).masters[0].id, "master-default");
  assert.equal((result.data as any).masters[0].elements[0].layer, "foreground");
});

test("master background accepts token and concrete color refs", () => {
  const tokenResult = safeParseDeck(baseDeck());
  assert.equal(tokenResult.success, true);

  const valueResult = safeParseDeck(
    baseDeck({
      masters: [
        {
          id: "master-default",
          name: "Default Master",
          background: { type: "solid", color: { value: "#ff0000" } },
          elements: [],
        },
      ],
    }),
  );
  assert.equal(valueResult.success, true);
});

test("master elements must be locked and layered", () => {
  const missingLayer = safeParseDeck(
    baseDeck({
      masters: [
        {
          id: "master-default",
          name: "Default Master",
          elements: [
            {
              id: "footer",
              kind: "text",
              role: "footer",
              masterChromeKind: "footer",
              locked: true,
              zIndex: 0,
              box: { x: 0, y: 0, w: 10, h: 10 },
              content: { kind: "text", text: "Footer" },
            },
          ],
        },
      ],
    }),
  );
  assert.equal(missingLayer.success, false);
  assert.match(missingLayer.error, /layer must/);

  const unlocked = safeParseDeck(
    baseDeck({
      masters: [
        {
          id: "master-default",
          name: "Default Master",
          elements: [
            {
              id: "footer",
              kind: "text",
              role: "footer",
              masterChromeKind: "footer",
              layer: "foreground",
              locked: false,
              zIndex: 0,
              box: { x: 0, y: 0, w: 10, h: 10 },
              content: { kind: "text", text: "Footer" },
            },
          ],
        },
      ],
    }),
  );
  assert.equal(unlocked.success, false);
  assert.match(unlocked.error, /locked must be true/);
});

test("master elements require a masterChromeKind", () => {
  const result = safeParseDeck(
    baseDeck({
      masters: [
        {
          id: "master-default",
          name: "Default Master",
          elements: [
            {
              id: "footer",
              kind: "text",
              role: "footer",
              layer: "foreground",
              locked: true,
              zIndex: 0,
              box: { x: 0, y: 0, w: 10, h: 10 },
              content: { kind: "text", text: "Footer" },
            },
          ],
        },
      ],
    }),
  );
  assert.equal(result.success, false);
  assert.match(result.error, /masterChromeKind must be one of/);
});

test("masterChromeKind must match element kind, role, and layer", () => {
  const logoAsText = safeParseDeck(
    baseDeck({
      masters: [
        {
          id: "master-default",
          name: "Default Master",
          elements: [
            {
              id: "logo",
              kind: "text",
              role: "logo",
              masterChromeKind: "logo",
              layer: "foreground",
              locked: true,
              zIndex: 0,
              box: { x: 0, y: 0, w: 10, h: 10 },
              content: { kind: "text", text: "Logo" },
            },
          ],
        },
      ],
    }),
  );
  assert.equal(logoAsText.success, false);
  assert.match(logoAsText.error, /kind must be "image"/);

  const footerInBackground = safeParseDeck(
    baseDeck({
      masters: [
        {
          id: "master-default",
          name: "Default Master",
          elements: [
            {
              id: "footer",
              kind: "text",
              role: "footer",
              masterChromeKind: "footer",
              layer: "background",
              locked: true,
              zIndex: 0,
              box: { x: 0, y: 0, w: 10, h: 10 },
              content: { kind: "text", text: "Footer" },
            },
          ],
        },
      ],
    }),
  );
  assert.equal(footerInBackground.success, false);
  assert.match(footerInBackground.error, /layer must be "foreground"/);
});

test("defaultMasterId must reference an existing master", () => {
  const result = safeParseDeck(baseDeck({ defaultMasterId: "missing" }));
  assert.equal(result.success, false);
  assert.match(result.error, /defaultMasterId must reference/);
});

test("superseded schema versions are rejected", () => {
  const result = safeParseDeck(
    baseDeck({ schemaVersion: CURRENT_DECK_SCHEMA_VERSION - 1 }),
  );
  assert.equal(result.success, false);
  assert.match(result.error, /schemaVersion .* is not supported/);
});
