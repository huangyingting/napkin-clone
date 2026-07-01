/**
 * Server-only PPTX parser boundary.
 *
 * The implementation lives in `pptx-parser.ts` so unit tests can exercise pure
 * parsing logic under the generic Node test runner, while app/runtime imports
 * keep Next.js `server-only` protection.
 */
import "server-only";

export { parsePptx } from "./pptx-parser";
