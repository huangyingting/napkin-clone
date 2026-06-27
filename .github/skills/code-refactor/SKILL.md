---
name: code-refactor
description: "Use when asked to analyze code for refactoring opportunities, plan code refactors, create GitHub refactor issues, decompose technical debt, or produce implementation-ready refactor plans. Uses evidence from source, tests, schemas, and fixtures to find high-leverage, reviewable refactors."
argument-hint: "Focus area, subsystem, issue count, or constraints"
---

# Code Refactor

Analyze the repository for high-leverage refactoring opportunities and turn the best ones into clear GitHub issues or issue drafts.

This is a planning and issue-creation skill. Do not edit source code unless the user explicitly asks to implement a specific refactor.

## Inputs

Treat invocation arguments as scope and constraints: subsystem, folder, file pattern, architectural concern, issue count, labels, or areas to avoid. If the user gives no count, choose a small set of the strongest refactors rather than trying to exhaust the repo.

## Heuristics

Look for refactors where the current shape makes future work harder or riskier:

- The same idea is implemented in multiple places with small, drifting differences.
- A file, route, component, or module mixes responsibilities that change for different reasons.
- A boundary is unclear: data shape, ownership, side effects, persistence, rendering, auth, collaboration, import/export, or AI behavior leaks across layers.
- Tests, fixtures, or schemas reveal awkward setup, repeated mocks, brittle assertions, or hidden coupling.
- Old compatibility paths, dead code, or future-only scaffolding obscure the current model.
- A local helper or established pattern exists but nearby code bypasses it.

Prefer refactors that reduce real complexity, clarify ownership, or make future changes cheaper. Avoid style-only cleanup, speculative rewrites, and abstractions that do not pay for themselves.

## Method

Start from the requested scope and read enough nearby source, tests, schemas, and fixtures to understand the controlling abstractions. Source and tests are authoritative; docs are background.

For each promising refactor, ask:

- What concrete pain or risk does this remove?
- Which files prove the pattern exists?
- What is the smallest reviewable slice?
- What behavior must remain unchanged?
- How would a maintainer verify the work?

Search existing GitHub issues before creating new ones. Reuse, extend, or link related issues when they already cover the work. If GitHub issue creation is unavailable, return polished drafts and state the blocker.

## Issue Shape

Use an epic only when several reviewable slices share the same architectural goal. Otherwise create a single focused refactor issue.

Each issue should include:

- Title: `[Refactor] <specific outcome>` or `[Refactor Epic] <theme>`
- Problem: what is hard today and why it matters.
- Evidence: workspace-relative file references and observed pattern.
- Approach: the preferred direction, aligned with existing codebase style.
- Scope: what is in, what is out, and what must not change.
- Verification: focused tests, typecheck, lint, fixture/schema checks, or docs checks.

Do not add labels, milestones, assignees, projects, or issue types unless the user asks.

## Final Response

- Link created or reused issues.
- Name the strongest skipped candidates only if useful.
- Summarize scope inspected, assumptions, and any blocked GitHub operations.
