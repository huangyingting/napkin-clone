import {
  checkLimit,
  type BudgetCheckResult,
  type LimitDefinition,
} from "@/lib/limits/budgets";

export const DOCUMENT_TITLE_MAX_LENGTH = 200;
export const DOCUMENT_CONTENT_MAX_LENGTH = 100_000;
export const LEXICAL_STATE_MAX_LENGTH = 2_000_000;
export const WORKSPACE_NAME_MAX_LENGTH = 100;
export const TAG_NAME_MAX_LENGTH = 50;
export const COMMENT_BODY_MAX_LENGTH = 5_000;
export const COMMENT_ANCHOR_TEXT_MAX_LENGTH = 280;
export const COMMENT_ANCHOR_NODE_ID_MAX_LENGTH = 200;

export const CONTENT_HARD_BYTES = DOCUMENT_CONTENT_MAX_LENGTH;
export const CONTENT_WARN_BYTES = Math.round(CONTENT_HARD_BYTES * 0.8);
export const LEXICAL_STATE_HARD_BYTES = LEXICAL_STATE_MAX_LENGTH;
export const LEXICAL_STATE_WARN_BYTES = Math.round(
  LEXICAL_STATE_HARD_BYTES * 0.8,
);

export const DOCUMENT_TITLE_LIMIT: LimitDefinition = {
  id: "document.title.length",
  description: "Stored document title length.",
  value: DOCUMENT_TITLE_MAX_LENGTH,
  unit: "chars",
  enforcement: "enforced",
  diagnostic: { scope: "document.title", metric: "documentTitleChars" },
  source: "src/app/app/actions.ts",
};

export const DOCUMENT_CONTENT_LIMIT: LimitDefinition = {
  id: "document.content.length",
  description: "Stored plain-text/Markdown document content length.",
  value: DOCUMENT_CONTENT_MAX_LENGTH,
  unit: "chars",
  enforcement: "enforced",
  warnAt: CONTENT_WARN_BYTES,
  diagnostic: { scope: "document.content", metric: "documentContentChars" },
  source: "src/app/app/actions.ts",
};

export const LEXICAL_STATE_LIMIT: LimitDefinition = {
  id: "editor.lexical-state.length",
  description: "Serialized Lexical editor state accepted by save.",
  value: LEXICAL_STATE_MAX_LENGTH,
  unit: "chars",
  enforcement: "enforced",
  warnAt: LEXICAL_STATE_WARN_BYTES,
  diagnostic: { scope: "document.lexical.save", metric: "lexicalStateBytes" },
  source: "src/app/app/documents/[id]/actions.ts",
};

export const WORKSPACE_NAME_LIMIT: LimitDefinition = {
  id: "workspace.name.length",
  description: "Stored workspace name length.",
  value: WORKSPACE_NAME_MAX_LENGTH,
  unit: "chars",
  enforcement: "enforced",
  diagnostic: { scope: "workspace.name", metric: "workspaceNameChars" },
  source: "src/app/app/workspaces/[id]/actions.ts",
};

export const TAG_NAME_LIMIT: LimitDefinition = {
  id: "document.tag.name.length",
  description: "Stored document tag name length.",
  value: TAG_NAME_MAX_LENGTH,
  unit: "chars",
  enforcement: "enforced",
  diagnostic: { scope: "document.tag", metric: "tagNameChars" },
  source: "src/app/app/documents/[id]/tags-actions.ts",
};

export const COMMENT_LIMITS: readonly LimitDefinition[] = [
  {
    id: "document.comment.body.length",
    description: "Stored comment body length.",
    value: COMMENT_BODY_MAX_LENGTH,
    unit: "chars",
    enforcement: "enforced",
    diagnostic: { scope: "document.comment", metric: "commentBodyChars" },
    source: "src/app/app/documents/[id]/comments-actions.ts",
  },
  {
    id: "document.comment.anchor-text.length",
    description: "Stored comment anchor text length.",
    value: COMMENT_ANCHOR_TEXT_MAX_LENGTH,
    unit: "chars",
    enforcement: "enforced",
    diagnostic: { scope: "document.comment", metric: "anchorTextChars" },
    source: "src/app/app/documents/[id]/comments-actions.ts",
  },
  {
    id: "document.comment.anchor-node-id.length",
    description: "Stored comment anchor node id length.",
    value: COMMENT_ANCHOR_NODE_ID_MAX_LENGTH,
    unit: "chars",
    enforcement: "enforced",
    diagnostic: { scope: "document.comment", metric: "anchorNodeIdChars" },
    source: "src/app/app/documents/[id]/comments-actions.ts",
  },
];

export function formatLexicalStateTooLargeError(): string {
  return "Document is too large to save.";
}

function withoutLimit(
  result: ReturnType<typeof checkLimit>,
): BudgetCheckResult {
  return {
    metric: result.metric,
    actual: result.actual,
    warnAt: result.warnAt,
    hardAt: result.hardAt,
    exceeded: result.exceeded,
    warned: result.warned,
  };
}

export function checkLexicalStateBudget(byteLength: number): BudgetCheckResult {
  return withoutLimit(checkLimit(LEXICAL_STATE_LIMIT, byteLength));
}

export function checkContentBudget(byteLength: number): BudgetCheckResult {
  return withoutLimit(checkLimit(DOCUMENT_CONTENT_LIMIT, byteLength));
}
