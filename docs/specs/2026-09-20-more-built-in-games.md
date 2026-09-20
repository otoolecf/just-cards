# TDD Spec: Solitaire, rubber Bridge, and Palace
_Status: Complete_
_Date: 2026-09-20_

## Intent
Add playable built-ins using reusable rules-as-data capabilities, retaining existing
room authority, event replay, privacy, recovery and score history. Read sources:
- https://bicyclecards.com/how-to-play/solitaire
- https://bicyclecards.com/how-to-play/bridge
- https://bicyclecards.com/how-to-play/palace
- https://www.pagat.com/beating/shithead.html
- https://www.pagat.com/auctionwhist/bridge.html (complete rubber scoring table)

## Rules and explicit defaults
- Patience capability: one player, seven triangular tableau columns, alternating
  colors descending, empty columns accept Kings, suited A–K foundations, draw one,
  unlimited stock recycling. Bicycle omits recycling/color details; these are
  conventional Klondike defaults, explicitly described. Win when all 52 are home;
  player can concede a blocked deal and redeal. Moves/stock actions support undo.
- Contract/trick capability: exactly four fixed seats, opposite seats are partners,
  clockwise auction, bids/pass/double/redouble, first bidder of final strain declares,
  dummy exposed only after opening lead and controlled by declarer, follow suit,
  trump/lead comparison. Rubber scoring includes under/overtricks, doubled/redoubled
  bonuses, slams, honors, games/vulnerability, rubber bonus and highest-total winner.
  No bots or tournament duplicate scoring. Preserve partnership seats throughout a
  rubber: replacements use recovery, roster changes only in a fresh lobby/rematch.
- Shedding capability: Palace setup three blind cards and choose three up from six;
  replenish private hand to three, then up cards, then blind cards. Forced pickup
  includes failed blind card. One deck for two, two decks for 3–5. First out wins.
  Bicycle standard preset plus a family preset: 10 clears and plays again, 2 can
  play on anything and resets comparison, 3 makes next player collect the pile and
  lose a turn, 7 requires next play <=7 (2/10 bypass). 3 otherwise obeys rank
  comparison; the 3/7 effects can be switched off in saved house rules. Four equal consecutive
  ranks burn the pile and pass the turn per Bicycle. No transparent cards/jokers.

## Implementation / tests
Extend versioned table policy with optional mutually exclusive patience, shedding,
and contract capabilities; shared room service dispatches by policy, never game name.
Tests first: schema rejection, deal counts/conservation, legal/illegal moves, privacy,
rank effects and blind pickup, auction and dummy authority, bridge arithmetic, round
completion and deterministic replay. Integrate capability-driven play boards and
physical score input where card-value addition is inappropriate. Preserve old imports;
never approve a new unsupported rule through old behavioral checks.
Run unit/check/build and isolated Worker browser tests for all three, mobile visuals,
and existing Golf/Rummy/offline-score regressions. Update docs with exact scope.

## Verification
- `npm test`: 310 tests across 57 files pass. New coverage includes complete
  Palace deals at every supported player count, complete Bridge trick play, auction
  legality and passed-out hands, deterministic replay, conservation, privacy,
  Solitaire moves/win/concede/recycle, Bridge arithmetic, offline contract events,
  partnership roster protection and saved Palace switches.
- `npm run check`: zero errors and warnings. `npm run build`: passes.
- Five new Worker browser tests pass on the final build: Solitaire draw/move/undo/
  rematch, two-phone Palace setup, four-phone Bridge auction/dummy control, offline
  Bridge scoring/undo/redo/reload, physical outcomes and saved Palace variants.
- Eleven existing Golf/Rummy, offline/house-rule, library and interruption browser
  regressions pass. The disconnect alarm case timed out in the parallel run and
  passed in an isolated rerun; no presence implementation was changed for this task.
- Mobile visual inspection at 390px: all three boards and Bridge scoring fit the
  page; controls are at least 44px high; no browser errors. Solitaire columns scroll
  inside the board and foundations fit a two-column grid.
- Main local Worker restarted on port 8787. Browser mutations used an isolated QA
  Worker on 8788; existing user games/catalog entries were preserved.

## Deliberate boundaries
Four humans are required for virtual Bridge; no bots, duplicate scoring or unfinished
rubber settlement bonus. Solitaire uses the documented draw-one defaults. Imported
AI policies for these new families remain blocked by the automatic readiness gate;
curated built-ins and schema-validated Palace switches are available now.
