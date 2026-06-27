---
description: "Run a 20-pass full-app browser UI audit and write UI-Testing.md."
name: "full-app-ui-audit"
argument-hint: "App URL plus optional credentials or setup notes"
agent: "agent"
---

Use the dev-browser skill to perform a comprehensive, human-like UI quality audit of the entire application.

Use the invocation arguments as the target app URL and any credentials, seed data, environment notes, or testing constraints. If no URL is provided, inspect the workspace for the appropriate local development command, start the app if needed, and test the local URL.

Your task is to explore the whole application through the browser as a real user would. Do not limit the audit to static inspection or to one feature area. Navigate through every reachable page, route, modal, panel, menu, dashboard, editor, settings screen, authentication flow, sharing or public page, import or export flow, document workflow, billing or account area, and any other visible product surface.

Run this full UI testing process 20 complete times.

A complete pass means:

- Visit every reachable page, route, modal, and major UI state.
- Exercise all major UI controls and workflows on each page.
- Interact with every meaningful product area, including document creation, editing, organization, deletion, import, export, sharing, account and settings, workspace flows, presentation and slide editing, public pages, and any admin or billing surfaces that are reachable.
- Try normal user actions, edge-case actions, and repeated actions.
- Capture screenshots of important screens, unusual states, bugs, layout issues, confusing interactions, visual inconsistencies, and every issue you report.
- Record console errors, failed requests, broken navigation, visual defects, confusing UX, inaccessible controls, inconsistent styling, performance issues, data persistence problems, and interaction bugs.

Simulate realistic human behavior:

- Move through the app using visible UI, navigation links, menus, buttons, breadcrumbs, and in-app affordances where available.
- Click, hover, drag, resize, type, select, edit, delete, duplicate, upload, download, undo, redo, open and close panels, switch tabs, use forms, and interact with dialogs.
- Test desktop and mobile-sized viewports.
- Try invalid, empty, long, unusual, and repeated inputs where appropriate.
- Confirm whether UI state persists correctly after navigation, refresh, repeated actions, and returning to previous pages.
- Watch for overlapping text, clipped labels, broken spacing, unexpected scrolling, missing focus states, non-responsive controls, confusing affordances, inconsistent visual hierarchy, inaccessible interactions, and broken responsive layouts.

Create or update `UI-Testing.md` with the full results. Do not mark the audit complete unless the report documents all 20 passes.

The report must include:

1. Testing environment
   - Date and time
   - Browser used
   - App URL
   - Viewports tested
   - Any setup assumptions, credentials source, seed data, or blocked permissions

2. Full-app coverage summary
   - List of all pages and routes visited
   - List of all major workflows tested
   - List of modals, menus, dialogs, panels, and transient UI states tested
   - Confirmation that 20 full passes were completed
   - Any pages, routes, permissions, or interactions that could not be reached, with explanation

3. Pass-by-pass notes
   - Separate notes for Pass 1 through Pass 20
   - Pages and workflows covered during each pass
   - Important observations from each pass
   - Bugs, regressions, inconsistencies, or intermittent behavior discovered during that pass

4. Screenshots
   - Screenshot references for key screens and every bug found
   - A brief description of what each screenshot shows
   - The pass number and page or workflow associated with each screenshot

5. Bugs and UI issues
   For each issue, document:
   - Title
   - Severity: Critical, High, Medium, Low, or Polish
   - Page, route, or workflow
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Screenshot reference
   - Console errors or failed network requests, if any
   - Suggested fix or design recommendation

6. Workflow-specific findings
   Cover every applicable product area, including:
   - Authentication and onboarding
   - Workspace or dashboard flows
   - Document creation, editing, organization, and deletion
   - Import flows
   - Export flows
   - Presentation and slide editing
   - Sharing and public pages
   - Account, profile, settings, billing, or subscription flows
   - Collaboration or realtime features, if available
   - Search, filtering, sorting, and navigation
   - Empty states, loading states, error states, and permission states

7. UX and visual design feedback
   - Navigation clarity
   - Information architecture
   - Layout consistency
   - Typography and spacing
   - Responsiveness across viewports
   - Accessibility concerns
   - Keyboard and focus behavior
   - Error handling and recovery
   - Overall polish and perceived product quality

8. Final assessment
   - Top 5 highest-priority fixes
   - Overall UI quality rating
   - Areas that feel production-ready
   - Areas that need follow-up testing
   - Recommended next testing pass or automation coverage

Be thorough and skeptical. Do not stop after finding the first issue. Continue until the entire application has been tested across all 20 complete passes. If something cannot be tested, document exactly why and what would be required to test it.
