# Switch decision log — Epic #436 command bus

- **Decision:** use `CommandEnvelope<P>` as the shared wire format across visual
  and deck mutations.
- **Why:** deck already has a pure executor (`slide-commands.ts`); the envelope
  should wrap it, not replace it.

## Specific decisions

1. **Deck stays on the current executor.**
   - `SlideCommand` remains the payload for deck envelopes.
   - `DeckPatch` and `CommandResult` are adapted into the cross-surface result
     shape instead of being duplicated.

2. **Visuals get a new pure executor.**
   - `visual-commands.ts` routes typed `visual.*` payloads over
     `src/lib/visual/transforms.ts`.
   - the executor emits serializable `VisualPatch` metadata and explicit side
     effects.

3. **Server validation stays pure.**
   - `command-validation.ts` depends only on envelope validation + caller-supplied
     context.
   - no Prisma or server-only imports are allowed in the validators.

4. **Projection is not user intent.**
   - `mirrorVisualNodes()` remains outside the command bus and is represented as
     `visual_mirror_rebuild` side-effect metadata.

5. **Machine-usable mutation inventory lives in docs, not source.**
   - the epic originally called for `mutation-inventory.ts`, but implementation
     keeps the inventory embedded as JSON in `docs/architecture/mutation-audit.md`
     to avoid a second authority.

## Consequences

- mixed visual + deck replay can share one envelope format immediately;
- existing slide save/revision-token logic is preserved;
- future comment/source-ref/asset command surfaces can adopt the same envelope
  without redesigning the core shape.
