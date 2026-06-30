# V7 Default Editor Rollout Checklist

**Status:** Current  
**Last updated:** 2026-06-30

This checklist gates the final v7 slide editor rollout evidence. The v7 editor is
already the unconditional default in the current code path; this checklist does
not introduce a feature flag or a legacy compatibility layer.

## Go / No-Go Gates

| Gate                                 | Required evidence                                                                                                                           | Current status                                                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release blocker epics                | V7-E01 through V7-E09 must be closed or intentionally deferred with owner approval.                                                         | #1212, #1213, #1214, #1215, #1216, #1217, #1219, and #1220 are closed. #1218 closes after #1267's chrome/decoration verification lands.                                                                                             |
| Template/theme parity                | Add slide, template reapply, theme switching, local overrides, diagnostics, and decoration/chrome/export behavior have executable coverage. | #1262, #1263, #1264, #1265, and #1266 are closed. This rollout adds final #1267 coverage for decoration/chrome layer order, detach/disable, and export parity.                                                                      |
| Release verification epic            | V7-E10 children must have executable evidence before #1221 closes.                                                                          | #1278, #1279, #1281, #1282, and #1283 are closed. This rollout completes #1280, #1284, and #1285 before closing #1221.                                                                                                              |
| Open/edit/save/present/public/export | V7 decks must have focused tests or E2E evidence for authoring and consumption paths.                                                       | Covered by existing open/migration/save, source review, public/present/export parity, and presentation subsystem tests.                                                                                                             |
| Visual regression                    | Editor layout and critical stage chrome must be tracked before default-editor rollout.                                                      | Existing opt-in Playwright screenshot specs remain the browser harness. This rollout adds deterministic static render coverage for dense stage chrome, filmstrip thumbnails, overlap, crop, rotation, connector, and chrome states. |
| Diagnostics and assets               | Missing assets, visual assets, orphan cleanup, deck chrome, and repairable diagnostics must remain covered.                                 | Existing presentation tests cover durable assets/orphan cleanup and diagnostics; this rollout adds combined deck chrome/decoration/export evidence.                                                                                 |

## Explicit Non-Goals For This PR

- Do not start the 100% coverage push in this rollout PR; it is the next queued
  step after the final v7 issues close.
- Do not add a new browser visual regression tool. Existing Playwright
  screenshot specs stay opt-in, while deterministic static render tests cover
  the required release gate.
- Do not run `npm run build` for this verification pass.

## Final Verification Commands

Passed for this rollout branch on 2026-06-30 after regenerating the local Prisma
client:

- Focused final verification tests for changed v7 render/export/editor files.
- `npm run test:presentation`
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`

Default-editor rollout is **go** only when those commands pass and #1267, #1280,
#1284, #1285, #1218, and #1221 are closed by the final verification PR.
