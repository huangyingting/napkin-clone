---
type: "reference"
status: "current"
last_updated: "2026-07-01"
description: "Architecture Decision Records (ADRs) capture durable choices that shape TextIQ's runtime architecture. Source, tests, and schemas remain authoritative for current behavior; ADRs explain why a decision was made and how to amend or supersede it when source behavior materially changes."
---

# Architecture Decision Records

Architecture Decision Records (ADRs) capture durable choices that shape TextIQ's
runtime architecture. Source, tests, and schemas remain authoritative for current
behavior; ADRs explain why a decision was made and how to amend or supersede it
when source behavior materially changes.

## Index

| ADR                                                                                | Status   | Supersedes | Superseded by | Related docs                                                                                                           |
| ---------------------------------------------------------------------------------- | -------- | ---------- | ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [Realtime collaboration scaling and durability](realtime-collaboration-scaling.md) | Accepted | —          | —             | [Collaboration deployment](../operations/collaboration-deployment.md), [system architecture](architecture.md)          |
| [Slide canvas keyboard accessibility](slide-canvas-keyboard-accessibility.md)      | Accepted | —          | —             | [Slide-stage interactions](../presentation/slide-stage-interactions.md), [release gate](../operations/release-gate.md) |

## Drift rule

- If a source, schema, or test change materially changes an accepted decision's
  context, constraints, chosen option, or consequences, update the ADR in the
  same change.
- If the old decision is no longer the chosen path, keep the historical ADR,
  set its `Superseded by` field, and add a new ADR that names what it
  supersedes.
- If a change only updates implementation details without changing the decision
  or its consequences, update the current-behavior docs instead of rewriting ADR
  history.
- The ADR index must list every ADR with status, supersession fields, and related
  current-behavior docs so accepted decisions stay discoverable.
