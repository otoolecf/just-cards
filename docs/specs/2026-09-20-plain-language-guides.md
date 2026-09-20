# TDD Spec: Plain-language play guides and browser walkthroughs

_Status: Complete_
_Date: 2026-09-20_

## Intent
Players should understand the goal, what to tap, and how a turn ends without knowing card-game terminology. Verify the actual controls through independent browser seats, including complete multiplayer deals.

## Scope and expected outcomes
- Capability-driven How to play sections explain Solitaire, Palace, Bridge, Golf and Rummy using everyday words, examples and actual button labels.
- Guides reflect the room's stored rules, including custom Palace effects, discard pickup restrictions, scoring and deal sizes. Existing rooms receive the same improved guide.
- Exercise real browser controls on isolated test rooms; correct discovered defects and retain regression coverage.
- Preserve game rules, private cards and the user's existing room.

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

## Verification results

- Red: guide tests failed because the guide builder did not exist. Lobby browser
  regression failed because the old help had no Your goal section.
- Green: 316 unit/integration tests (58 files); 10 browser regression tests;
  `npm run check` (zero errors/warnings), `npm run build`, and `git diff --check`.
- Independent native Python Playwright walkthroughs, at 390px width:
  - Family Palace: complete deal, all four special ranks, pile pickups/clears,
    multiple-card plays, face-up and blind cards, automatic score and rematch.
  - Bicycle Palace: complete deal with pickups, clears, face-up/blind cards and rematch.
  - Bridge: bid, double, redouble, 52 cards / 13 tricks, 13 dummy plays,
    follow-suit restrictions, automatic score and next deal.
  - Rummy: complete round with 3 discard-pickup melds, 2 new hand melds,
    10 layoffs and automatic scores.
  - Solitaire: final run moved all 52 cards to foundations, including column/sequence
    moves, draw-pile recycling, undo, concede after undo, and a fresh deal.
  - Golf: existing two-phone test completed a round and dealt the next.
- No browser page errors or horizontal page overflow in the walkthroughs.
  Expanded mobile help visually reviewed. No gameplay changes were needed for these flows.
- Lobby and room now share the guide component. No data migration or edits to the
  user's existing room; all playthroughs used a separate QA Worker and new rooms.

These walkthroughs verify the exercised deals and controls, not every possible deal
or an entire multi-deal Bridge rubber. Existing engine tests cover deterministic
rule-edge cases separately.
