# Command Architecture

**Status:** Current  
**Last updated:** 2026-06-23

These documents cover serializable user intent, mutation routing, and command
metadata across document visuals and deck artifacts.

| Document                                   | Scope                                                          |
| ------------------------------------------ | -------------------------------------------------------------- |
| [command-envelope.md](command-envelope.md) | Cross-surface command envelope schema and validation contract. |
| [mutation-audit.md](mutation-audit.md)     | Inventory of mutation paths and routing decisions.             |

## Boundaries

- Pure command executors produce serializable metadata.
- Projection rebuilds and server-only writes are explicit side effects, not user
  intent commands.
