import type { NextRequest } from "next/server";
import { type NextResponse } from "next/server";

import { validationError } from "@/lib/api/errors";
import { readFormData } from "@/lib/api/route-adapters";

export async function parseImportUploadRequest(
  request: Pick<NextRequest, "formData">,
): Promise<{ ok: true; file: File } | { ok: false; response: NextResponse }> {
  const form = await readFormData(
    request,
    "Request must be multipart/form-data.",
    validationError,
  );
  if (!form.ok) {
    return form;
  }

  const file = form.formData.get("file");
  if (!(file instanceof File)) {
    return {
      ok: false,
      response: validationError("Missing `file` field in form data."),
    };
  }

  return { ok: true, file };
}
