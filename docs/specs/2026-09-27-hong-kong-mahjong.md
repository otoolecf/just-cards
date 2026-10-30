# Hong Kong mahjong: guided tiles and physical scoring

## Intent
Enable families to learn and play four-player Hong Kong mahjong on phones, or score physical games. Preserve existing card rules, serialized rooms and score events.

## Scope and rules
- Opt-in `tileMahjong` table capability; separate typed tile inventory, without widening CardRank/CardSuit or changing existing deck behavior.
- 136 tiles (no flowers/jokers), four copies of 34 types; dealer starts with 14, others 13. Ordered per-seat discards, exposed groups, concealed hands, front draws and back kong replacements.
- Hong Kong classical scoring based on HKMA English rules (https://www.hkmahjong.org/rules?lang=en). Original implementation and prose; do not bundle downloaded rulebook.
- Four groups and pair, thirteen orphans, nine gates and other listed limit hands. No seven-pairs house rule. Minimum 3 faan, cap 10; payment schedule per payer on self draw: 16/32/48/64/96/128/192/256 for 3..10. Discarder alone pays twice that amount. Liability for fourth exposed group or third dragon group, latest liability replaces earlier.
- Wins outrank triplet/quad claims, which outrank sequences; sequence only from previous seat. Equal-priority wins go to nearest next seat (explicit family convention). Everyone responds/pass, no timed loss of claims. Responses and uncommitted tile selections remain private.
- Concealed, claimed and added quads; rob added quad, or concealed quad only with thirteen orphans. Replacement draws, last-wall wins, consecutive quads, initial-hand wins, no shifting a claimed group by immediately discarding an equivalent tile.
- Dealer repeats on win; otherwise rotates including draws. Four full wind rotations end the game. Fixed seats across hands; private recovery remains available. No bots, tournament penalties or flower variants in this preset.
- Full tile artwork in original inline SVG, beginner labels, contextual legal choices and plain-language scoring. Hints see only own tiles and public data.
- Physical scoring: quick faan entry or tile-based scoring with declared groups and winning context; winner/payer selection; atomic zero-sum score event, undo/redo, offline replay and round/dealer context.

## Expected outcomes / acceptance
- New built-in visible in Play and Score. Existing presets continue unchanged.
- Illegal commands rejected atomically; shuffled tile IDs do not encode face identity. Viewer projection excludes wall, other hands, and other pending responses.
- Scores derive from validated hands in live rooms and from validated round inputs in physical mode. Payments sum to zero; explanations identify counted patterns.
- Touch targets >=44px, keyboard access, no horizontal page overflow at 390px.
- Persist/reconnect/undo work during claim windows and after scoring.

## Test plan (red → green)
Inventory, decomposition ambiguity, limit hands, invalid copies, threshold and payouts; complete draw/discard/claim/kong/win/exhaustion flows; response precedence independent of arrival; privacy; replay and old presets; score event undo/redo and offline round trip. Browser four-seat mobile play and score entry, existing game regressions. Run complete unit suite, check, build.

## Rollback
Do not deploy as part of implementation. New capability is isolated and optional; remove its catalog entry to stop creating new games without changing existing card rooms. Preserve support for already saved tile rooms when deploying future versions.
