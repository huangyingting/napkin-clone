import { redirect } from "next/navigation";

import { requireDocumentCapability } from "@/lib/auth/document-permissions";
import { createRequireDocumentActionContext } from "@/lib/actions/document-action-context";
import { requireUser } from "@/lib/session";

export const requireDocumentActionContext = createRequireDocumentActionContext({
  requireUser: () => requireUser(redirect),
  requireDocumentCapability,
});
