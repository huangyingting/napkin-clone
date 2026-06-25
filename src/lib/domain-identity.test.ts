import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  AssetId,
  DocumentBlockId,
  DocumentId,
  LexicalNodeKey,
  SlideElementId,
  SlideId,
  UserId,
  VisualId,
  WorkspaceId,
} from "./domain-identity";

type Expect<T extends true> = T;

export type DomainIdentityTypeAssertions = [
  Expect<DocumentId extends string ? true : false>,
  Expect<string extends DocumentId ? false : true>,
  Expect<DocumentBlockId extends string ? true : false>,
  Expect<string extends DocumentBlockId ? false : true>,
  Expect<LexicalNodeKey extends string ? true : false>,
  Expect<string extends LexicalNodeKey ? false : true>,
  Expect<VisualId extends string ? true : false>,
  Expect<SlideId extends string ? true : false>,
  Expect<SlideElementId extends string ? true : false>,
  Expect<AssetId extends string ? true : false>,
  Expect<WorkspaceId extends string ? true : false>,
  Expect<UserId extends string ? true : false>,
];

test("domain identity aliases are compile-time-only branded strings", () => {
  assert.ok(true);
});
