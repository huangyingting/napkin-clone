import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resetBrandStorageAdapter,
  setBrandStorageAdapter,
} from "@/lib/brand/asset-storage";
import {
  uploadBrandFont,
  uploadBrandLogo,
} from "@/lib/brand/upload-route-service";
import { prisma } from "@/lib/prisma";

type TestContext = { after: (fn: () => void) => void };

function stubObjectMethod<T extends object, K extends keyof T>(
  t: TestContext,
  object: T,
  methodName: K,
  implementation: (...args: any[]) => unknown,
): { calls: unknown[][] } {
  const original = object[methodName];
  const calls: unknown[][] = [];
  Object.defineProperty(object, methodName, {
    configurable: true,
    value: (...args: unknown[]) => {
      calls.push(args);
      return implementation(...args);
    },
  });
  t.after(() => {
    Object.defineProperty(object, methodName, {
      configurable: true,
      value: original,
    });
  });
  return { calls };
}

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x48, 0x44,
  0x52, 0, 0, 0x01, 0x00, 0, 0, 0x02, 0x00,
]);
const WOFF2_BYTES = Buffer.from("wOF2");

type UploadCase = {
  kind: "logo" | "font";
  upload: (
    request: Request,
    ownerId: string,
  ) => Promise<{
    ok: boolean;
    status?: number;
  }>;
  fileName: string;
  mime: string;
  bytes: Uint8Array | Buffer;
};

const CASES: UploadCase[] = [
  {
    kind: "logo",
    upload: uploadBrandLogo,
    fileName: "logo.png",
    mime: "image/png",
    bytes: PNG_BYTES,
  },
  {
    kind: "font",
    upload: uploadBrandFont,
    fileName: "font.woff2",
    mime: "font/woff2",
    bytes: WOFF2_BYTES,
  },
];

function buildRequest(
  testCase: UploadCase,
  brandId?: string,
  ownerId = "owner-1",
): Request {
  const formData = new FormData();
  const blob = new Blob([Uint8Array.from(testCase.bytes)]);
  formData.set(
    testCase.kind,
    new File([blob], testCase.fileName, { type: testCase.mime }),
  );
  if (brandId) {
    formData.set("brandId", brandId);
  }
  return new Request(`http://localhost/api/brand/${testCase.kind}`, {
    method: "POST",
    headers: { "x-owner-id": ownerId },
    body: formData,
  });
}

describe("upload brand asset ownership checks", () => {
  it("rejects missing and foreign brand ids before any asset mutation", async (t) => {
    let storeCalls = 0;
    setBrandStorageAdapter({
      async store() {
        storeCalls += 1;
        return "/api/brand-assets/unused";
      },
      urlFor: () => "/api/brand-assets/unused",
      async read() {
        return Buffer.from("");
      },
      async delete() {},
    });
    t.after(resetBrandStorageAdapter);

    const brandFindFirst = stubObjectMethod(
      t,
      prisma.brand,
      "findFirst",
      async () => null,
    );
    const assetFindUnique = stubObjectMethod(
      t,
      prisma.asset,
      "findUnique",
      async () => {
        throw new Error("asset lookup should not run for invalid brand ids");
      },
    );
    const assetCreate = stubObjectMethod(
      t,
      prisma.asset,
      "create",
      async () => {
        throw new Error("asset create should not run for invalid brand ids");
      },
    );
    const assetUpdate = stubObjectMethod(
      t,
      prisma.asset,
      "update",
      async () => {
        throw new Error("asset update should not run for invalid brand ids");
      },
    );

    for (const brandId of ["brand-missing", "brand-foreign"]) {
      for (const testCase of CASES) {
        const result = await testCase.upload(
          buildRequest(testCase, brandId),
          "owner-1",
        );
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.status, 404);
        }
      }
    }

    assert.equal(storeCalls, 0);
    assert.equal(assetFindUnique.calls.length, 0);
    assert.equal(assetCreate.calls.length, 0);
    assert.equal(assetUpdate.calls.length, 0);
    assert.equal(brandFindFirst.calls.length, 4);
  });

  it("links owned brand ids on new logo and font uploads", async (t) => {
    let createdCount = 0;
    const createdBrandIds: Array<string | null | undefined> = [];
    setBrandStorageAdapter({
      async store(storageKey) {
        return `/api/brand-assets/${storageKey}`;
      },
      urlFor: (storageKey) => `/api/brand-assets/${storageKey}`,
      async read() {
        return Buffer.from("");
      },
      async delete() {},
    });
    t.after(resetBrandStorageAdapter);

    stubObjectMethod(t, prisma.brand, "findFirst", async () => ({
      id: "brand-owned",
    }));
    stubObjectMethod(t, prisma.asset, "findUnique", async () => null);
    stubObjectMethod(t, prisma.asset, "create", async ({ data }: any) => {
      createdCount += 1;
      createdBrandIds.push(data.brandId);
      return { id: `asset-${createdCount}` };
    });
    const assetUpdate = stubObjectMethod(
      t,
      prisma.asset,
      "update",
      async () => {
        throw new Error("new upload path should not update existing assets");
      },
    );

    for (const testCase of CASES) {
      const result = await testCase.upload(
        buildRequest(testCase, "brand-owned"),
        "owner-1",
      );
      assert.equal(result.ok, true);
    }

    assert.equal(createdCount, 2);
    assert.deepEqual(createdBrandIds, ["brand-owned", "brand-owned"]);
    assert.equal(assetUpdate.calls.length, 0);
  });

  it("updates deduplicated uploads only when the brand id is owned", async (t) => {
    let storageWrites = 0;
    const updateBrandIds: Array<string | null | undefined> = [];
    setBrandStorageAdapter({
      async store(storageKey) {
        storageWrites += 1;
        return `/api/brand-assets/${storageKey}`;
      },
      urlFor: (storageKey) => `/api/brand-assets/${storageKey}`,
      async read() {
        return Buffer.from("");
      },
      async delete() {},
    });
    t.after(resetBrandStorageAdapter);

    stubObjectMethod(t, prisma.brand, "findFirst", async ({ where }: any) =>
      where?.id === "brand-owned" ? { id: "brand-owned" } : null,
    );
    stubObjectMethod(t, prisma.asset, "findUnique", async () => ({
      id: "asset-existing",
      storageKey: "owner-1/existing.woff2",
      deletedAt: null,
      brandId: null,
    }));
    stubObjectMethod(t, prisma.asset, "create", async () => {
      throw new Error("deduplicated uploads should not create new assets");
    });
    const assetUpdate = stubObjectMethod(
      t,
      prisma.asset,
      "update",
      async ({ data }: any) => {
        updateBrandIds.push(data.brandId);
        return {};
      },
    );

    const owned = await uploadBrandFont(
      buildRequest(CASES[1], "brand-owned"),
      "owner-1",
    );
    assert.equal(owned.ok, true);

    const missing = await uploadBrandFont(
      buildRequest(CASES[1], "brand-missing"),
      "owner-1",
    );
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.status, 404);
    }

    const noBrand = await uploadBrandFont(buildRequest(CASES[1]), "owner-1");
    assert.equal(noBrand.ok, true);

    assert.equal(storageWrites, 2);
    assert.equal(assetUpdate.calls.length, 1);
    assert.deepEqual(updateBrandIds, ["brand-owned"]);
  });
});
