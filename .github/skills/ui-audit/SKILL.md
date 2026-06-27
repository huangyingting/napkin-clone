---
name: ui-audit
description: "Use when asked to run a browser UI audit, app UI testing, click through pages, simulate human app usage, capture screenshots, test interactions, document UI bugs, inspect responsive behavior, or write a feedback report under docs/feedback/. Uses dev-browser for scope-driven product QA."
argument-hint: "App URL, scope, credentials, or setup notes"
---

# UI Audit

Use the dev-browser skill to audit the requested application or product area like a real user, then write a concise evidence-based feedback report under `docs/feedback/`.

## Inputs

Treat invocation arguments as the app URL, scope, credentials, seed data, viewport constraints, and setup notes. If no URL is provided, inspect the workspace for the local dev command, start the app if needed, and test the local URL.

If no scope is provided, audit the entire reachable application. If a narrower scope is provided, audit it deeply and document adjacent surfaces touched during testing.

## Output Location

Create or update a Markdown feedback report under `docs/feedback/`. Choose a concise, descriptive filename when the invocation does not specify one.

When adding a new feedback report file, update `docs/feedback/README.md` so the document table links to it.

## Procedure

1. Establish the environment: URL, browser, user role, auth state, seed data, and viewports.
2. Build a coverage inventory from visible navigation and, when useful, nearby route/source structure.
3. Exercise the UI through visible controls: click, hover, type, drag, resize, select, upload, download, undo/redo, open panels, switch tabs, submit forms, and use dialogs.
4. Test realistic paths and edge cases: empty, invalid, long, repeated, interrupted, refresh, back/forward, and return-to-page flows.
5. Check desktop and mobile-sized viewports unless the invocation narrows viewport scope.
6. Watch console output and failed network requests while testing.
7. Capture screenshots for key screens, unusual states, and every reported issue.
8. Reproduce each bug when practical before documenting it.

Repeat exploratory sweeps as needed until the requested scope is covered. There is no fixed number of passes. Do not claim completion if important pages, workflows, viewports, or interactions remain untested.

## Coverage Matrix

Track coverage for every applicable area:

- Pages, routes, modals, menus, panels, dialogs, empty/loading/error states, and permission states.
- Authentication, onboarding, workspace/dashboard, document, import/export, presentation or slide editing, sharing/public pages, account/settings/billing, collaboration, search/filter/sort, and admin surfaces when reachable.
- Create, edit, organize, delete, duplicate, save, refresh, navigate away/back, and persistence behavior.
- Responsive layout, keyboard/focus behavior, accessibility basics, visual hierarchy, text clipping, overlap, spacing, scrolling, disabled states, and loading feedback.

## Issue Quality Bar

- Report only issues backed by observed behavior, screenshots, console output, or failed requests.
- For each bug, include severity, page/workflow, reproduction steps, expected behavior, actual behavior, evidence, and a suggested fix.
- Separate product-blocking bugs from polish feedback.
- Document untested or unreachable surfaces explicitly with the reason and what would be needed to test them.

## Report Requirement

The feedback report must include these sections:

1. **Testing Environment**: date/time, browser, app URL, viewports, requested scope, auth role, setup assumptions, seed data, and blocked permissions.
2. **Coverage Summary**: pages/routes visited, workflows tested, transient UI states tested, and anything unreachable.
3. **Findings**: prioritized bugs and UI issues with severity, reproduction steps, expected/actual behavior, screenshots, console or network evidence, and suggested fix.
4. **Workflow Notes**: observations for each major product area covered.
5. **UX And Visual Feedback**: navigation, information architecture, layout, typography, responsiveness, accessibility, error handling, and polish.
6. **Final Assessment**: top 5 fixes, overall quality rating, production-ready areas, follow-up testing, and recommended automation coverage.

Be thorough and skeptical. Do not stop after finding the first issue. Favor concrete evidence over broad impressions.
