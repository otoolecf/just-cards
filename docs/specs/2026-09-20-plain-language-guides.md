# TDD Spec: Plain-language play guides and browser walkthroughs

## Intent
Players should understand the goal, what to tap, and how a turn ends without knowing card-game terminology. Verify the actual controls through independent browser seats, including complete multiplayer deals.

## Scope and expected outcomes
- Capability-driven How to play sections explain Solitaire, Palace, Bridge, Golf and Rummy using everyday words, examples and actual button labels.
- Guides reflect the room's stored rules, including custom Palace effects, discard pickup restrictions, scoring and deal sizes. Existing rooms receive the same improved guide.
- Exercise real browser controls on isolated test rooms; correct discovered defects and retain regression coverage.
- Preserve game rules, private cards and existing rooms.

## Acceptance criteria / test plan (red → green)
- Unit tests: every built-in has an actionable guide; disabled Palace effects disappear; Golf pairing and Rummy pickup instructions follow policy; deal counts and scoring values remain accurate.
- Browser: Solitaire draw/move/recycle/undo/end, Palace setup and full deal, Bridge bidding/dummy/follow suit/full deal, Golf and Rummy existing flows plus meld/layoff where available.
- Check mobile overflow, browser errors and expanded help.
- npm run check, npm run build and relevant tests pass.

## Data and implementation
A pure guide builder consumes TableRules and card values. The shared table renders structured sections instead of ingestion diagnostics. No game-ID dispatch or new design tokens.

## Out of scope
Bots, strategy coaching, changing game variants, deployment.

## Rollback
Revert guide builder and shared-table integration; no persistence migration is required.
