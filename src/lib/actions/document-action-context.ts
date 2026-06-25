import {
  requireDocumentCapability,
  type Capability,
} from "@/lib/auth/document-permissions";
import { requireUser } from "@/lib/session";

export type DocumentActionUser = Awaited<ReturnType<typeof requireUser>>;

export type DocumentActionContext = {
  user: DocumentActionUser;
  authorization: Awaited<ReturnType<typeof requireDocumentCapability>>;
};

type DocumentActionContextDeps = {
  requireUser: typeof requireUser;
  requireDocumentCapability: typeof requireDocumentCapability;
};

export function createRequireDocumentActionContext(
  deps: DocumentActionContextDeps,
) {
  return async function requireDocumentActionContextWithDeps(
    documentId: string,
    capability: Capability,
    options: Parameters<typeof requireDocumentCapability>[3] = {},
  ): Promise<DocumentActionContext> {
    const user = await deps.requireUser();
    const authorization = await deps.requireDocumentCapability(
      user.id,
      documentId,
      capability,
      options,
    );

    return { user, authorization };
  };
}

export const requireDocumentActionContext = createRequireDocumentActionContext({
  requireUser,
  requireDocumentCapability,
});
