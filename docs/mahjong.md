# Hong Kong mahjong

Choose **Hong Kong Mahjong** in Play or Score. Shared play needs four people on separate browsers/devices. Physical scoring needs only one device. Normal play is the default. The shared **Guided mode** checkbox enables extra teaching text and remembers your choice on this browser across games. Tile labels are on by default and can be turned off independently.

## Rules in this preset

This is a 136-tile, no-flower Hong Kong classical table. It has three numbered suits, four winds and three dragons, with four copies of each face. No jokers, flower bonuses, seven-pairs variant or bots. The host takes the initial East seat; joining order determines South, West and North. Shuffling is cryptographically randomized with opaque piece identities.

The engine validates complete hands, scoring, discards, sequences, triplets, all three kinds of quads, replacement draws, and robbing quads. Other players may win from an added quad; thirteen orphans can rob a concealed quad. Declared quad faces are public; the concealed classification remains recorded. Exposed groups are permanent, and exchanging a just-claimed group by discarding an equivalent tile is disallowed.

Our rules reference is the [Hong Kong Mahjong Association's classical rules](https://www.hkmahjong.org/rules?lang=en), English version dated May 17, 2023. We use original code, artwork and explanatory text, not a redistributed copy of the rulebook. Explicit digital/family conventions:

- Every other player chooses a claim or Pass; there is no reaction timer. Submitted choices stay private until resolution. Wins outrank matching groups, which outrank sequences. If multiple wins are declared, the next eligible seat in turn order wins, irrespective of response arrival.
- Four groups and a pair is the normal shape; thirteen orphans is also supported. The scorer searches alternative decompositions and uses the highest value.
- Minimum 3 faan, maximum 10. Bonuses stack. Detailed patterns and exceptions are in the in-app guide, derived from the capability.
- For 3–10 faan the self-draw share is 16/32/48/64/96/128/192/256 points. Each opponent pays a share. On a discard win only the discarder pays, at twice the share. Points always sum to zero.
- Feeding a fourth declared group or third dragon group creates liability for a later self draw. The latest liability replaces the previous one; the final discarder still pays on a discard win.
- Dealer stays on a win, rotates otherwise, including a drawn hand. Four complete dealer rotations (East/South/West/North prevailing winds) finish the match. Player identities remain fixed across hands; use seat recovery for replacements.
- Invalid actions are prevented, rather than penalized as tournament fouls. An exhausted wall ends the hand once pending discard claims resolve. No separate reserved dead wall is used; quad replacement draws come from the opposite end of the remaining wall.

## Learning and scoring

The tile board shows your private rack, every player's exposed groups and ordered remaining discards, current winds, and wall count. Claim choices explain what they do. A beginner guide illustrates sequences and pairs. All guidance is computed from your hand and public state only. End-of-hand scoring displays the winning groups, counted faan and payments.

Physical scoring supports **Enter tiles** and **Quick entry**. Tile entry includes the winning tile, separately entered declared groups, and winning circumstances. The app derives seat/round winds from prior results. Quick entry trusts your stated faan; both methods use the same payment calculation. Liability in physical play is entered by the scorekeeper. Undo/redo restores totals and dealer/wind progression. Device snapshots and the existing offline outbox retain these results through reload and reconnect.

## Data contracts and compatibility

`TableRules.tileMahjong` is optional and mutually exclusive with card capabilities. Its policy contains `scoring: hk-classical/v1`, `flowers: false`, `minFan: 0..3`, `maxFan: 10`, `prevailingWinds: 1|4`, and `liability: boolean`. Values below 3 and a single wind rotation are supported authoring options for practice variants; the built-in uses 3 and 4. Practice faan 0/1/2 use shares of 2/4/8.

The existing card rank/suit types and 52-card inventory are unchanged. Tile inventory lives under an optional authoritative `TableState.mahjong`; legacy states lack this field and follow their existing dispatch. Stored deal events carry either card or tile inventory, interpreted by the room's immutable policy snapshot. Projections explicitly exclude the wall, concealed opponent tile identities/faces, and pending response contents.

Tile commands: `tile_draw`, `tile_discard`, `tile_respond`, `tile_kong`, `tile_win`. Legal options are computed server-side; validation and mutation are atomic. Room revision checking, pause/resume, recovery, undo and persistence use the existing room event log.

Physical score event `add_mahjong` includes the configured four players, copied policy and result (draw, or winner/payer with either faan or complete tile inputs). Server validation binds it to the session's configured seats and policy. Replay derives zero-sum totals and `ScoreState.mahjong` progression. There are no new databases or Durable Object classes.

AI imports remain blocked for this capability until a dedicated source-review/behavioral import gate is added. A schema-valid candidate alone cannot claim to have passed that review.

## Verification

Tests cover inventory conservation, hidden-information projections, scoring and ambiguous decomposition, claims independent of arrival order, all quad types, robbed quads, complete exhausted-wall replay, payments, liability, dealer rotation, match completion, room pause/recovery/undo, offline scoring and old card capabilities. `tests/browser/mahjong_walkthrough.py` uses four mobile browser contexts and actual buttons for shared play and both physical entry methods. Existing card walkthroughs remain in `tests/browser/play_walkthrough.py`.

Verified locally on 2026-09-27: all 355 tests across 63 files pass, and Svelte checking reports no errors or warnings. An isolated Wrangler preview completed 482 mahjong table actions, including a full exhausted-wall hand, results after reconnect, the next deal, and ending the room. Both quick-faan and tile-based physical scoring saved and survived reload. Four 390px browser contexts showed no horizontal page overflow or browser errors.

Existing-game browser regressions also passed: Golf (19 actions), Rummy 500 (50), Solitaire (108), family Palace (96), Bicycle Palace (85), and Bridge (60). These exercise completed rounds, melds and layoffs, stock recycling, blind Palace cards, follow-suit and dummy play. No production deployment was performed.
