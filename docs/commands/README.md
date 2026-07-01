---
type: "contract"
status: "current"
last_updated: "2026-07-01"
description: "These documents cover serializable user intent, mutation routing, and command metadata across document visuals and deck artifacts."
---

# Command Architecture

These documents cover serializable user intent, mutation routing, and command
metadata across document visuals and deck artifacts.

| Document                                                       | Type      | Scope                                                                |
| -------------------------------------------------------------- | --------- | -------------------------------------------------------------------- |
| [command-envelope.md](command-envelope.md)                     | Contract  | Cross-surface command envelope schema and validation contract.       |
| [actions-and-shortcuts.md](actions-and-shortcuts.md)           | Contract  | UI action descriptors, shortcut catalog, and action-port boundaries. |
| [mutation-routing-inventory.md](mutation-routing-inventory.md) | Reference | Inventory of mutation paths and routing decisions.                   |

## Boundaries

- Pure command executors produce serializable metadata.
- Projection rebuilds and server-only writes are explicit side effects, not user
  intent commands.
- UI action descriptors may point at shortcut ids, but execution still belongs
  to the owning surface or injected action port.
