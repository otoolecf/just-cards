# UI Primitives v0

This document defines the visual primitive layer for `just-cards` UI.

## Goals

1. Keep styling consistent across Score + Play surfaces.
2. Keep tokens explicit and reusable for generated game UI.
3. Enforce WCAG contrast for core text/status/button combinations.

## Source of Truth

- Token + contrast logic: `src/lib/ui/design-primitives.ts`
- Global token export + utility classes: `src/app.css`

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

## Card and entry primitives

- `CardTile` uses `jc-card`, `jc-card-back`, `jc-card-red`, and `jc-card-selected`
  from the shared stylesheet. Existing semantic tokens supply all colors. Cards
  retain a minimum 48×68px target, visible focus, and descriptive accessible labels.
- Public cards are readable when noninteractive; disabled controls cannot submit
  actions. Selection uses `aria-pressed`; suit pickers use radio semantics.
- `CardTapInput` supports optional suits and fixed grid slots. Rank-only guided
  entry avoids unnecessary suit taps. Editing a slot must never shift columns;
  clearing a round resets the active slot.
- Shared rooms use wrapped private hands, horizontal discard scrolling, explicit
  turn/pickup instructions, live errors, and round totals on narrow screens.
- Button variants are reactive so selection and enabled-state changes remain visible.

No new color tokens are introduced; existing contrast guarantees remain applicable.

`CardTile` supports opt-in dragging in hand-arrangement mode, with equivalent tap
and keyboard-operated left/right controls. Arrangement selection is separate from
play selection and stays local to the viewer. `ScoreButton.describedBy` associates
layoff buttons with visible explanatory text; disabled actions must explain whether
the player must wait, draw, select cards or choose a compatible meld.

## Complete family workflows

The lobby shares `jc-panel`/`jc-control` primitives for import, recent-room resume and
seat management. Private hand sorting only changes presentation; fixed grid positions
and card identity remain authoritative. Suggested/selected melds use the server's
pure meld predicate to gate actions. Round history scrolls within its panel on small
screens, and the rules guide reads card values from the room bundle. Connection status
distinguishes live socket updates from fallback/reconnection.

The separate pattern editor follows the ruleset's `scorekeeper.patternRound`
capability in guided scoring. Raw scoring places the editor in a collapsed
Advanced/custom scoring disclosure with a minimum 44px summary target.

House-rule forms reuse `jc-panel`, `jc-control` and ScoreButton, with responsive rank
value fields and labelled native inputs. Checkbox labels and disclosure summaries
retain 44px targets. Score sync status announces device saves, pending changes and
conflicts; recovery is an explicit action. CardTapInput's `columnPairs` hint follows
the active scoring policy rather than assuming every grid cancels matching columns.

### Capability boards

Patience, shedding and contract boards reuse `CardTile`, `ScoreButton`, `jc-panel`,
`jc-control` and semantic colors. Solitaire keeps at least 44px of each selectable
card exposed in a column; its seven-column layout scrolls inside the board, with
an explicit narrow-screen hint. Foundations use two columns on mobile and four on
wider screens. Bridge partnership panels and hands wrap; selection uses the existing
card-selected primitive. No new color or motion tokens are introduced.

### Mahjong tiles

`MahjongTile` supplies original inline SVG dots, bamboo, character, wind and dragon
faces. It uses existing surface/brand/text/error tokens, an optional plain-language
label, descriptive accessible names, pressed selection and visible keyboard focus.
Interactive tiles are at least 52px wide and 82px tall; racks wrap within the mobile
page. The shared tile component serves live play and physical scoring. No new color
or motion tokens are introduced. Gameplay controls reuse ScoreButton.

### Guided mode toggle

`GuidedModeToggle` is shared by live rooms and draft previews. Its native checkbox
uses a labelled 44px-minimum touch target and semantic text tokens. Normal mode is
the default; optional teaching text follows the bound personal preference. Essential
status, errors, controls and the rules disclosure remain usable in normal mode.

### Stable score rows

Scorekeeper totals follow entry roster order, with separate ordinal rank text using
existing muted-text and small-type tokens. The list is unordered so row position
cannot imply rank. Leader styling follows computed rank, including ties.

### Shared source footer

The root layout includes a centered “Source on GitHub” link below route content.
It reuses `jc-mode-link` for a minimum 44px touch target and the shared muted text
and small typography tokens. It retains the global focus indicator and opens a
separate tab with `noopener noreferrer` so an active game remains open.

### Project disclosure

The shared footer offers a native, initially collapsed “About this project”
details/summary above the source link. Its summary is at least 44px high, retains
the global keyboard focus treatment, and uses the footer's existing muted text
and small typography tokens. Expanded copy wraps inside a bounded reading width.

### Brand wordmark

`BrandWordmark` combines a small overlapping-card ornament with a bold “Just” and
italic serif “Cards”. It uses existing foreground, brand, surface and line tokens,
inherits its size from the heading or link, and uses system fonts. Decorative
cards are hidden from assistive technology; the accessible text is “Just Cards”.
Score and Play use it as their main title; rooms retain their game heading with
the wordmark in the home link. Branding adds no motion or external assets.

### About panel and event history

The footer About disclosure uses `jc-panel`, a left-aligned summary with a
non-announced plus/close indicator, and three paragraphs. The AI disclosure uses
the existing muted surface and small type; main copy uses the medium type token.
Scorekeeper Recent events uses native details/summary, collapsed on initial render
with a visible event count. Adding events does not force it open. Both summaries
retain keyboard focus indicators and at least 44px targets. Event metadata wraps
inside the panel on narrow screens.
