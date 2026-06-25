import assert from "node:assert/strict";
import { test } from "node:test";

import JSZip from "jszip";

import {
  IMPORT_ZIP_MAX_ENTRIES,
  ImportBudgetError,
  loadZipWithinBudget,
} from "@/lib/import/archive-budget";

test("loadZipWithinBudget accepts ordinary archives", async () => {
  const zip = new JSZip();
  zip.file("word/document.xml", "<w:document />");
  const buffer = Buffer.from(await zip.generateAsync({ type: "uint8array" }));

  const loaded = await loadZipWithinBudget(buffer);
  assert.ok(loaded.files["word/document.xml"]);
});

test("loadZipWithinBudget rejects archives with too many entries", async () => {
  const zip = new JSZip();
  for (let i = 0; i <= IMPORT_ZIP_MAX_ENTRIES; i++) {
    zip.file(`f-${i}.txt`, "");
  }
  const buffer = Buffer.from(await zip.generateAsync({ type: "uint8array" }));

  await assert.rejects(
    () => loadZipWithinBudget(buffer),
    (error) => error instanceof ImportBudgetError,
  );
});
