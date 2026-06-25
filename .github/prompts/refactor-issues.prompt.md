---
description: "Analyze the repo and create GitHub refactoring epics with child issues."
name: "lite-refactor"
argument-hint: "Optional focus area or number of epics"
agent: "agent"
---

Analyze this repository for refactoring opportunities and create GitHub issues directly. Do not create or update a separate roadmap document.

Focus on refactoring domains such as:

- modularity, reusable boundaries, subsystem design, extensibility, and readability;
- duplicated logic or repeated patterns;
- oversized files that should be split by responsibility;
- dead code, future-only scaffolding, old migration code, and runtime compatibility for superseded shapes;
- server actions, API routes, UI shells, schemas, persistence, tests, config, assets, auth, billing, collaboration, rendering/export, and AI flows.

Process:

1. Inspect enough code and tests to ground each finding in real files.
2. Group related findings into concise refactoring epics.
3. For each epic, choose the best strategy and define concrete requirements.
4. Create one parent GitHub issue for each epic.
5. Create child issues for the actionable slices under that epic.
6. Link child issues to the parent as GitHub sub-issues when supported.
7. Search for exact existing issue titles first and reuse them instead of creating duplicates.

Parent issue format:

- Title: `[Refactor Epic] <Epic title>`
- Body sections: Problem, Best Strategy, Requirements, Child Issues, Verification.

Child issue format:

- Title: `[Refactor] <Child issue title>`
- Body sections: Parent Epic, Scope, Requirements, Verification.

Keep issue text concise, implementation-ready, and grounded in file references. Do not add labels, milestones, assignees, projects, or issue types unless the user asks.
