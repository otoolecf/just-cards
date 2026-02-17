# UI Primitives v0

This document defines the visual primitive layer for `just-cards` UI.

## Goals

1. Keep styling consistent across Score + Play surfaces.
2. Keep tokens explicit and reusable for generated game UI.
3. Enforce WCAG contrast for core text/status/button combinations.

## Source of Truth

- Token + contrast logic: `/Users/ConnorO/git_repos/just-cards/src/lib/ui/design-primitives.ts`
- Global token export + utility classes: `/Users/ConnorO/git_repos/just-cards/src/app.css`

## Agent Workflow Contract

Use this contract for all future agent-driven UI work:

1. Read this file before changing styles/components.
2. Prefer existing semantic tokens and utility classes before adding new ones.
3. Do not introduce ad-hoc hex colors unless also promoted to semantic token.
4. Keep behavior/style split clear:
   - behavior primitives in gameplay/session/rules modules
   - visual primitives in `design-primitives.ts` + `app.css`
5. If visual semantics change, update:
   - this document
   - token/test source files
   - relevant feature spec(s)

## Color Token Set

Core semantic tokens:

- `bg`, `surface`, `surfaceElevated`, `surfaceMuted`
- `text`, `textMuted`, `line`
- `brand`, `brandStrong`, `brandSoft`, `textOnBrand`
- `success`, `error`, `warning`, `info`

Typography + motion primitives:

- typography scale: `xs`, `sm`, `md`, `lg`, `xl`
- motion durations: `fastMs`, `normalMs`, `slowMs`
- easing curves: `easeStandard`, `easeEmphasized`

Global CSS aliases are exposed as `--jc-*` and compatibility aliases (`--surface`, `--muted`, etc.) for existing components.

## Accessibility Contract

Contrast is tested in unit tests (`src/lib/ui/design-primitives.test.ts`) with AA-focused thresholds:

- Normal text pairs: minimum `4.5:1`
- Accent/support pairs: minimum declared per pair (`>= 3.0` or `>= 4.5`)

If tokens change, tests must remain green.

Additional UI rhythm tests enforce monotonic typography and ordered motion timing.

## Shared UI Classes

Global primitive classes in `src/app.css`:

- `jc-mode-links`, `jc-mode-link`
- `jc-control`
- `jc-panel`
- `jc-subtle`
- `jc-status-success`, `jc-status-error`

These are intended as building blocks for game-driven UI surfaces.

## Design Intent (Simple, Smart, Beautiful)

Target aesthetic:

1. Simple: low visual clutter, clear hierarchy, obvious primary actions.
2. Smart: data-driven labels/layouts that map to game primitives without one-off UI branches.
3. Beautiful: restrained accent usage, coherent spacing rhythm, subtle purposeful motion.

Keep visual decisions conservative and consistent with this tone.

## Usage Guidance

1. Prefer semantic tokens over hardcoded hex values.
2. Keep layout/theme overrides local to a route, but inherit from shared tokens.
3. Preserve touch targets (`min-height: 44px`) for controls and buttons.
4. Add contrast pairs/tests before introducing new semantic colors.
5. Reuse shared motion and typography tokens for transitions/headings/body text.
