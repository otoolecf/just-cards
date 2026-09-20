# TDD Spec: Explain Rummy hand counts and table actions

_Status: Complete_

## Intent and expected outcomes

Explain the configured starting hand size in hand/meld games and distinguish playing
a new meld from adding cards to an existing public meld. Use **Play new meld** and
**Add to this meld**, with corresponding discard-pickup labels. The turn banner
explicitly tells arranging players to finish arranging before playing.

Starting counts come from the room policy/player-count override, not game-name
checks. Gameplay rules, card ownership and scoring remain unchanged.

## Red → green verification

Extend the two-player Rummy browser test to assert the 13-card explanation and new
action label before changing the UI. Update the complete Worker Rummy flow to use
the new labels and verify real meld/pickup/layoff actions. Run check and build.

## Verification

The new browser assertion failed on the previous UI and passes after the copy
update. Type check reports zero errors/warnings and build passes. Five Worker
browser tests pass, including a complete Rummy round with eight new melds, four
additions to existing melds and five discard pickups. The updated local Worker is
running; no gameplay or scoring rules changed.
