# TDD Spec: Rummy hand arrangement and layoff guidance

_Status: Complete_

## Intent

Players can organize their own hand while waiting and understand that melds have
already been played on the table. Disabled layoff buttons explain the missing step.

## Expected outcomes

- Hand/meld games offer Arrange hand, with tap-to-move, left/right controls and
  desktop dragging. This mode does not play cards or change the server's hand.
- Manual order and sort preference survive reload. Draws append new cards; played
  cards disappear without disturbing the remaining order. Grid games keep fixed slots.
- Arranging works out of turn, separately from selection for playing cards.
- Table melds explain that they are public played cards; layoff hints distinguish
  waiting for a turn, drawing first, selecting cards and incompatible combinations.
- All enabled layoff actions still use the shared meld predicate and authoritative
  server rules, including immediate use of a selected discard and ace-high runs.

## Red → green tests

Pure presentation tests cover reordering, reconciliation, nonmutation and layoff
reasons. Two-browser tests verify local arranging out of turn, tap/drag/keyboard,
reload, unchanged server state and subsequent draws. Run existing complete Rummy
Worker flow to exercise real melds/layoffs plus check, build and unit tests.

## Verification

Three new tests failed before implementation. All 250 unit tests now pass; check
reports zero errors/warnings and build passes. The arrangement browser test passes
on Vite and Worker, including tap, keyboard, drag, reload, unchanged server view,
opponent updates and a new draw. All 15 Worker browser tests pass; the complete
Rummy round exercised eight melds, six layoffs, five discard pickups and 84 private
socket projections. The local Worker was restarted with the updated build.

Read-only inspection of the reported room showed the player waiting for the other
seat's turn, with A♦ in hand and J♦–Q♦–K♦ already on the table. Layoff was correctly
blocked by turn order; the added hint makes that prerequisite visible.
