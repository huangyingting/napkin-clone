import assert from "node:assert/strict";
import test from "node:test";

import { assertViewModelSerializable } from "@/lib/view-models/serializable";

import { buildDashboardViewModel } from "./view-model";

test("dashboard view model shapes localized labels and onboarding state", () => {
  const viewModel = buildDashboardViewModel({
    userEmail: "ada@example.com",
    locale: "en",
    onboardingDismissed: false,
    hasVisuals: true,
    documentList: {
      hasDocuments: true,
      listCapped: false,
      availableTags: [{ slug: "plan", name: "Plan" }],
      documents: [
        {
          id: "doc-1",
          title: "Roadmap",
          favorite: true,
          editedLabel: "Feb 3, 2026",
          workspaceName: "Team",
          thumbnail: null,
          excerpt: "Quarterly plan",
          readingMinutes: 1,
          createdAtMs: 1,
          updatedAtMs: 2,
          canEdit: true,
          canManage: false,
          tags: [{ slug: "plan", name: "Plan" }],
        },
      ],
    },
  });

  assert.equal(viewModel.title, "Your documents");
  assert.match(viewModel.subtitle, /ada@example\.com/);
  assert.equal(viewModel.newDocumentLabel, "New document");
  assert.equal(viewModel.onboarding.show, true);
  assert.equal(viewModel.onboarding.steps[0]?.done, true);
  assert.equal(viewModel.onboarding.steps[1]?.done, true);
  assertViewModelSerializable(viewModel);
});

test("dashboard view model suppresses dismissed onboarding", () => {
  const viewModel = buildDashboardViewModel({
    userEmail: "ada@example.com",
    locale: "en",
    onboardingDismissed: true,
    hasVisuals: false,
    documentList: {
      hasDocuments: false,
      listCapped: true,
      availableTags: [],
      documents: [],
    },
  });

  assert.deepEqual(viewModel.onboarding, { show: false, steps: [] });
  assert.equal(viewModel.listCapped, true);
  assertViewModelSerializable(viewModel);
});
