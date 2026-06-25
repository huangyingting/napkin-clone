# Design System Boundary

**Status:** Current  
**Last updated:** 2026-06-25

TextIQ app chrome uses the `--ds-*` tokens in `src/app/globals.css` as the
source of truth. Visual-content palettes and themes remain separate in
`src/lib/visual/themes.ts`.

## Layers

- `src/app/globals.css` owns app-chrome tokens, the Tailwind `@theme` bridge,
  base typography/prose, layout utilities, dark-mode overrides, and semantic
  z-index utilities.
- `src/components/ui/tokens.ts` owns reusable class tokens such as focus rings,
  gutter buttons, menu/panel chrome, and toolbar control states.
- `src/components/ui/` owns reusable primitives for toolbar buttons, panel
  surfaces, popover sections, field rows, icon action clusters, and status pills.
- Feature components compose these primitives with local layout only.

## Guardrails

Run `npm run design-system:check` before UI refactors. It is also part of
`npm run lint`.

The check rejects:

- raw numeric z-index utilities like `z-10` or `z-[999]`; use semantic utilities
  from the Tailwind bridge, such as `z-raised`, `z-dropdown`, `z-modal`, or
  `z-toast`;
- raw arbitrary hex color classes in feature components, such as
  `bg-[#ffffff]`; add or reuse a semantic token/theme utility instead.

Raw palette values are allowed only in token/theme-owned files and visual-content
theme definitions.
