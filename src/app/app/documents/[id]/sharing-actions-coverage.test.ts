import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, beforeEach, describe, it } from "node:test";

type ModuleHooks = {
  registerHooks(hooks: {
    resolve(
      specifier: string,
      context: unknown,
      nextResolve: (specifier: string, context: unknown) => unknown,
    ): unknown;
    load(
      url: string,
      context: unknown,
      nextLoad: (url: string, context: unknown) => unknown,
    ): unknown;
  }): void;
};

type SharingCoverageState = {
  calls: unknown[];
  requireDocumentActionContext: (
    documentId: string,
    capability: string,
  ) => Promise<void>;
  updateDocumentSharePolicyData: (
    documentId: string,
    data: Record<string, unknown>,
  ) => Promise<unknown>;
  revalidatePath: (path: string) => void;
};

const globalForSharing = globalThis as typeof globalThis & {
  __sharingActionsCoverageState: SharingCoverageState;
};

function createState(): SharingCoverageState {
  const calls: unknown[] = [];
  return {
    calls,
    async requireDocumentActionContext(documentId, capability) {
      calls.push(["requireDocumentActionContext", documentId, capability]);
    },
    async updateDocumentSharePolicyData(documentId, data) {
      calls.push(["updateDocumentSharePolicyData", documentId, data]);
      return { isShared: true, shareId: "share-1", ...data };
    },
    revalidatePath(path) {
      calls.push(["revalidatePath", path]);
    },
  };
}

globalForSharing.__sharingActionsCoverageState = createState();

const { registerHooks } = createRequire(import.meta.url)(
  "node:module",
) as ModuleHooks;
const stubPrefix = "textiq-sharing-actions-coverage:";
const stubbedModules = new Map<string, string>([
  [
    "next/cache",
    `
      export function revalidatePath(path) {
        globalThis.__sharingActionsCoverageState.revalidatePath(path);
      }
    `,
  ],
  [
    "./document-context",
    `
      export async function requireDocumentActionContext(...args) {
        return globalThis.__sharingActionsCoverageState.requireDocumentActionContext(...args);
      }
    `,
  ],
  [
    "@/lib/document/persistence-service",
    `
      export async function setDocumentSharing() {
        throw new Error("setDocumentSharing is not used in this coverage test");
      }
      export async function regenerateDocumentShareLink() {
        throw new Error("regenerateDocumentShareLink is not used in this coverage test");
      }
      export async function updateDocumentSharePolicyData(...args) {
        return globalThis.__sharingActionsCoverageState.updateDocumentSharePolicyData(...args);
      }
    `,
  ],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (stubbedModules.has(specifier)) {
      return {
        url: `${stubPrefix}${encodeURIComponent(specifier)}`,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(stubPrefix)) {
      const specifier = decodeURIComponent(url.slice(stubPrefix.length));
      return {
        format: "module",
        source: stubbedModules.get(specifier) ?? "",
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

let sharingActions: typeof import("./sharing-actions");

before(async () => {
  sharingActions = await import("./sharing-actions");
});

beforeEach(() => {
  globalForSharing.__sharingActionsCoverageState = createState();
});

describe("sharing actions focused coverage", () => {
  it("rejects invalid expiry before persistence or revalidation", async () => {
    assert.deepEqual(
      await sharingActions.updateSharePolicy("doc-1", { expiresAt: "never" }),
      { ok: false, error: "Invalid expiry date." },
    );
    assert.deepEqual(globalForSharing.__sharingActionsCoverageState.calls, [
      ["requireDocumentActionContext", "doc-1", "manage"],
    ]);
  });

  it("persists an explicit ISO expiry", async () => {
    const result = await sharingActions.updateSharePolicy("doc-1", {
      expiresAt: "2027-02-03T04:05:06.000Z",
    });

    assert.equal(result.ok, true);
    const persisted = globalForSharing.__sharingActionsCoverageState
      .calls[1] as [string, string, { shareExpiresAt: Date }];
    assert.equal(persisted[0], "updateDocumentSharePolicyData");
    assert.equal(
      persisted[2].shareExpiresAt.toISOString(),
      "2027-02-03T04:05:06.000Z",
    );
  });
});
