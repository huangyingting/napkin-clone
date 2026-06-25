import assert from "node:assert/strict";
import test from "node:test";

import { assertViewModelSerializable } from "@/lib/view-models/serializable";

import { buildBrandStudioViewModel } from "./view-model";

test("brand studio view model exposes serialized brands and entitlements", () => {
  const viewModel = buildBrandStudioViewModel({
    canUseBrandStyles: true,
    canUploadFont: false,
    brands: [
      {
        id: "brand-1",
        name: "Acme",
        ownerId: "user-1",
        palette: ["#000000", "#ffffff"],
        background: "#ffffff",
        nodeFill: "#f8fafc",
        nodeStroke: "#111827",
        nodeText: "#111827",
        edgeColor: "#94a3b8",
        fontFamily: "'Inter', sans-serif",
        fontAssetId: null,
        logoAssetId: "asset-1",
        fontDataUrl: null,
        logoUrl: "/api/brand-assets/logo.svg",
        createdAt: "2026-02-03T04:05:06.000Z",
        updatedAt: "2026-02-04T04:05:06.000Z",
      },
    ],
  });

  assert.equal(viewModel.brands[0]?.name, "Acme");
  assert.equal(viewModel.canUseBrandStyles, true);
  assert.equal(viewModel.canUploadFont, false);
  assertViewModelSerializable(viewModel);
});
