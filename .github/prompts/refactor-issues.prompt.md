---
description: "Find high-value repo refactors and create GitHub epic issues with child issues."
name: "lite-refactor"
argument-hint: "Optional focus area, subsystem, issue count, or constraints"
agent: "agent"
---

Analyze this repository for high-value refactoring opportunities and create GitHub issues directly. Do not create or update a separate roadmap document.

Use the invocation arguments as optional scope, such as a subsystem, folder, file pattern, number of epics, or constraints. If no count is provided, create 3 to 5 parent epics with 2 to 5 actionable child issues each. Create fewer only when the codebase does not support more well-grounded findings.

Respect the repository instructions. Treat source code, tests, schemas, and fixtures as authoritative; use docs as background only. Do not propose runtime compatibility layers for superseded payload shapes.

Prioritize refactoring domains such as:

- modularity, ownership boundaries, subsystem design, extensibility, and readability;
- duplicated logic or repeated patterns that create real maintenance risk;
- oversized files, mixed responsibilities, and unclear abstraction boundaries;
- dead code, future-only scaffolding, obsolete migrations, and stale compatibility paths;
- server actions, API routes, UI shells, schemas, persistence, tests, config, assets, auth, billing, collaboration, rendering/export, import, editor, public pages, and AI flows.

Discovery process:

1. Inspect enough nearby source, tests, schemas, and fixtures to ground each finding in concrete files.
2. Prefer findings with clear maintenance cost, product risk, or repeated implementation friction.
3. Avoid vague cleanup, style-only work, speculative rewrites, and issues that cannot name affected files.
4. Group related findings into concise parent epics with independently shippable child issues.
5. For each epic, choose the best strategy and define concrete requirements.
6. Search GitHub issues for exact and close existing titles before creating anything.
7. Reuse existing issues instead of creating duplicates. If a parent exists, create only missing child issues when useful.
8. Create the parent issue before its child issues.
9. Link child issues to the parent as GitHub sub-issues when supported. If sub-issues are unavailable, include the parent issue link in each child body and list child links in the parent body or a parent comment.

Parent issue format:

- Title: `[Refactor Epic] <Epic title>`
- Body sections: Problem, Evidence, Best Strategy, Requirements, Child Issues, Verification, Non-goals.

Child issue format:

- Title: `[Refactor] <Child issue title>`
- Body sections: Parent Epic, Scope, Evidence, Requirements, Verification, Dependencies/Risks.

Issue quality bar:

- Keep each issue concise, implementation-ready, and grounded in workspace-relative file references.
- Make every child issue small enough to be reviewed independently.
- Include verification steps that match the touched surface, such as focused tests, typecheck, lint, or docs checks.
- Do not add labels, milestones, assignees, projects, or issue types unless the invocation arguments explicitly ask for them.
- Do not edit source code as part of this prompt.
- If GitHub issue creation is unavailable or blocked by permissions, stop after preparing issue drafts in the chat response and clearly state the blocker. Do not create a local roadmap file unless the user asks.

Final response:

- List created parent issues and child issues with links.
- List reused existing issues with links.
- Note any skipped findings and why they did not meet the quality bar.
- Summarize the scope inspected and any assumptions made.
