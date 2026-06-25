export * from "./envelope-core";
export * from "./command-result-helpers";
export * from "./command-envelope-validation";
export * from "./deck-command-acceptance";

import type { SlideCommand } from "@/lib/presentation/slide-commands";
import type { CommandEnvelope } from "./envelope-core";

export type SlideCommandEnvelope = CommandEnvelope<SlideCommand>;
