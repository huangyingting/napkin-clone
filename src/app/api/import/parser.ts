import type { NextRequest } from "next/server";
import { type NextResponse } from "next/server";

import { validationError } from "@/lib/api/errors";
import { readFormData } from "@/lib/api/route-adapters";
import { IMPORT_MAX_UPLOAD_BYTES } from "@/lib/limits";

export async function parseImportUploadRequest(
  request: Pick<NextRequest, "formData"> &
    Partial<Pick<NextRequest, "headers">>,
): Promise<{ ok: true; file: File } | { ok: false; response: NextResponse }> {
  const form = await readFormData(
    request,
    "Request must be multipart/form-data.",
    validationError,
    {
      maxBytes: IMPORT_MAX_UPLOAD_BYTES,
      tooLargeMessage: "Uploaded file is too large.",
    },
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
