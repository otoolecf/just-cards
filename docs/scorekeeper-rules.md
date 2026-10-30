# Scorekeeper Rule Abstraction

This document explains how score calculation works in the current scorekeeper engine and how to customize it for different games.

For the canonical versioned Rule IR contract, see:
`docs/rulepack-v0.md`

## Core Model

Scoring is based on three layers:

1. Card input (`CardInput`): card rank, optional suit, optional tags/designators.
2. Base rule pack (`RulePack`): default value map for ranks.
3. Ordered modifiers (`ValueModifier[]`): overrides that apply when predicates match.

In addition, score accumulation is target-based, not player-only:

- `player` targets for individual totals
- `team` targets for partnership games (for example bridge-style)
- `pool` targets for shared pools like crib/kitty before settlement

The engine computes each card value by:

1. Starting from base value (`A` uses `baseAceValue`, others use `rankValues`).
2. Evaluating modifiers in order.
3. Replacing the value each time a modifier matches.
4. Returning the final value after all matching modifiers.

This document focuses on card-value and score-delta evaluation.
Play legality and pattern detection are related but separate concerns.

## Built-in Score Modes (UI)

Score mode presets used by the score page are defined in:
`src/lib/session/score-session-commands.ts`

- `Standard`: A=1, 2-10 face value, J/Q/K=11/12/13
- `500 Rummy`: A=15, 2-10 face value, J/Q/K=10
- `Six Card Golf`: A=1, 2=-2, 3-10 face value, J/Q=10, K=0
- `Cribbage`: face cards forced to 10

Each mode also declares standings intent:

- `high_wins`: larger totals rank first (Standard, 500 Rummy, Cribbage)
- `low_wins`: smaller totals rank first (Six Card Golf)

The score page also exposes deterministic assistant flows that post `add_delta` events:

- `Manual points`: enter signed deltas directly
- `500 Rummy net`: `delta = sum(table cards) - sum(hand cards)`
- `Six Card Golf hole`: 2x3 row-major input with same-column pair-zero rule

Current scoring implementation includes pattern-driven rounds:

- Use `add_pattern_round` to pass a `patternPack` and `patternScoring` array
  (`patternId -> points`).
- Matches are detected per target card set and routed to the same target scoring model.
- Missing `patternId` mappings are surfaced as validation issues.
- Direct/manual deltas are supported via `type: add_delta` with signed
  `entries[]` per scoring target.

Implementation details are captured in `./specs/2026-02-16-scorekeeper-pattern-flow.md`.

## Generalizable Rule Primitives

For broader game support (for example cribbage and rummy), model rules in four parts:

1. `Validator` (`canPlay`): determines whether a move is legal.
2. `PatternDetector` (`whatPatternsExist`): identifies combinations like runs, sets, pairs, fifteens.
3. `Scorer` (`scorePatterns`): maps patterns to signed deltas.
4. `Trigger`: chooses when scoring runs (action-triggered or phase-triggered).

### Why split these

- Some rules gate whether cards can be played at all (not scoring yet).
- Some scoring happens immediately on an action.
- Some scoring is evaluated at the end of a hand/phase.

Examples:

- Rummy “must be a run or three-of-a-kind” is primarily `Validator`.
- Cribbage pair/run/fifteen counting is `PatternDetector` + `Scorer`.
- Bridge-style team scoring maps naturally to `team` scoring targets.
- Crib/kitty ownership uses `pool` targets with phase-end settlement.

## Why This Pattern

- It avoids hardcoding game-specific logic.
- It supports simple and unusual scoring variants.
- It is parser-friendly (LLM output can be normalized into typed predicates/modifiers).

## Important Nuances

## 1) Modifier order matters

Later matching modifiers override earlier ones.

Use general rules first and specific exceptions after.

## 2) Overlap is expected

A card may match multiple predicates (for example `is_face` and `has_tag`).
That is valid; final value is based on last matching rule.

## 3) Tags are designators, not magic logic

Tags like `ace_high`, `wild`, or `melded` are just metadata.
Their meaning comes from modifiers in the active `RulePack`.

## 4) Keep predicates explicit

Prefer explicit predicates over broad catch-alls when possible, to avoid accidental overrides.

## Customization Examples

## Example A: Standard rank scoring

```ts
const rules = createRulePack();
// A=1, 2..10=rank, J=11, Q=12, K=13
```

## Example B: Face cards are 10

```ts
const rules = createRulePack({
  modifiers: [{ id: 'faces-ten', when: { kind: 'is_face', value: true }, value: 10 }]
});
```

## Example C: Non-face cards are 5 (rummy-style variant)

```ts
const rules = createRulePack({
  modifiers: [{ id: 'non-face-five', when: { kind: 'is_face', value: false }, value: 5 }]
});
```

## Example D: Golf-style exception (2s are -2)

```ts
const rules = createRulePack({
  modifiers: [
    { id: 'non-face-five', when: { kind: 'is_face', value: false }, value: 5 },
    { id: 'twos-minus-two', when: { kind: 'rank_is', rank: '2' }, value: -2 }
  ]
});
```

## Example E: Per-card designator (ace can be high by tag)

```ts
const rules = createRulePack({
  modifiers: [
    { id: 'aces-default-low', when: { kind: 'is_ace', value: true }, value: 1 },
    { id: 'ace-high-tag', when: { kind: 'has_tag', tag: 'ace_high' }, value: 14 }
  ]
});

const normalAce = { rank: 'A' };
const highAce = { rank: 'A', tags: ['ace_high'] };
```

## Example F: Team targets (pair game)

```ts
const events = [
  {
    type: 'add_round',
    entries: [
      { target: { kind: 'team', id: 'north_south' }, cards: [{ rank: '10' }, { rank: 'K' }] },
      { target: { kind: 'team', id: 'east_west' }, cards: [{ rank: '7' }, { rank: '8' }] }
    ]
  }
];
```

## Example G: Crib/kitty pool settlement

```ts
const events = [
  {
    type: 'add_round',
    entries: [{ target: { kind: 'pool', id: 'crib' }, cards: [{ rank: 'Q' }, { rank: 'K' }] }]
  },
  {
    type: 'settle_pool',
    fromPoolId: 'crib',
    toTarget: { kind: 'player', id: 'dealer' }
  }
];
```

## Current Limits (Intentional for now)

- Modifiers now support ordered algebra (`set`, `add`, `multiply`, `clamp_min`, `clamp_max`), with first/last match control.
- Predicates are single-condition (no AND/OR groups yet).
- Card context beyond card metadata (for example round state) is not yet part of predicate evaluation.
- Validator/pattern/scorer primitives are wired and composable:
  - `patternPack` detection flows into scorekeeper via `add_pattern_round`.
  - `add_round`, `add_delta`, and `settle_pool` primitives remain active for direct scoring and transfers.
  - Runtime trigger orchestration exists in `src/lib/runtime/game-runtime.ts`.
- Pool settlement currently supports direct transfer only (no split or percentage distribution).
- Runtime trigger conditions are finite (event type, phase, optional zone filters), not arbitrary expression trees.

These are good next extensions after scorekeeper MVP if needed.

## Family entry and persistence

Guided profiles derive from explicit `tableRules` when available. Golf preserves
six grid positions and cancels equal vertical pairs. Rummy sums contributed table
cards and subtracts remaining hand cards; only ranks are required for these scoring
profiles. Physical-game users still decide which cards are legal melds. Raw entry
continues to support quick values and other game variants.

Player names are stored in session config before the first event. SessionRepository
persists config and event logs in local SQLite or Worker Durable Object SQLite.
Reload restores the saved session; standings and undo/redo remain event-derived.
The UI never stores mutable totals as its source of truth. See
[Shared table v1](./shared-table-v1.md) for the storage boundary and conventions.

## Pattern-round entry capability

Stored rulesets may set `uiProfile.scorekeeper.patternRound` to explicitly enable
or disable the separate guided pattern editor. The boolean is validated as part of
the UI schema and copied into saved `GuidedScoreProfile` data. Missing metadata
defaults to hidden, including in previously saved sessions. Golf column cancellation
and Rummy card totals remain in normal guided entry. Raw calculator sessions retain
the generic pattern editor under **Advanced/custom scoring**.

## Offline physical scoring

After loading the built app once online, the score page displays **Available offline
on this device**. You can start a session, enter guided cards/manual values, undo,
redo and reload without a connection. Cached family rules are available at setup.
Joining a session that has never been opened on that device still needs a connection.

Each browser keeps a versioned snapshot and pending score events in local storage.
Totals replay the same score engine with the original rule pack; they are not saved
as authoritative mutable numbers. The UI saves pending events before acknowledging
entry, shows pending counts, and retries when the active session is refreshed or
connectivity returns. Keep the score page open to sync; background sync while the
app is closed is not implemented. Closed sessions remain in **Saved on this device**
and can be reopened to sync. Clearing browser data removes unsynced work.

Session creation uses a stable UUID; append requests carry a stable requestId and
expectedEventCount. Server retries return the existing event, conflicting payloads
or stale prefixes return 409, and Durable Object transactions serialize writes.
Browser Web Locks serialize tabs sharing an outbox. Current browsers on HTTPS or
localhost are required. The API retains compatibility with older callers omitting
these optional fields. GET includes the original scoreRulePack for offline replay.

If another device advances the log while offline events are pending, sync pauses.
**Save my scores as a separate session** copies the locally seen event history to a
new session; it does not apply an offline undo to someone else's newer round. Both
versions remain stored. Storage failures are surfaced instead of claiming a save.

The SvelteKit service worker precaches build assets and the scorekeeper shell. It
never caches APIs or private room HTML. This provides offline physical scoring only;
shared virtual games still require connectivity. A first visit cannot work offline.

## Outcome and contract entry

Guided profiles can specify `roundScoring: 'outcome' | 'solo_outcome' | 'contract'`.
These replace rank-entry zones with result controls and hide unrelated pattern entry.
Palace selects the first player out (one point); Solitaire records a win or concede
(one or zero points), with a one-player score sheet.

Bridge selects four players in partnership order (1 & 3, 2 & 4). Enter declaring
partnership, contract level/strain, doubling, total tricks taken, and optional honors
held in a single hand. `add_contract` score events contain those facts and fixed
player order; the shared rubber scorer derives points, games, below-line progress,
vulnerability, and rubber completion. Events cannot change partnerships mid-rubber.
Undo/redo replays both scoring and vulnerability, including offline and after reload.
Contract entry stops when the rubber finishes; create a new session for another.
Manual-delta entry is hidden in guided Bridge to avoid silently changing totals
without updating game/vulnerability progress. Passed-out hands need no score entry.

These are rubber scores, including honors, not duplicate scores. There is no bonus
settlement for an unfinished rubber. The virtual table and physical contract inputs
call the same arithmetic function; score state remains derived from immutable events.

## Stable score display

Current score uses the same player roster order as round entry. Rows never move
based on totals. Separate ordinal labels use the configured low/high-win direction;
tied totals share competition rank (1st, 1st, 3rd) with a Tied label. All players in
first place are highlighted. Before scoring, the empty state remains; after scoring
starts, roster players without entries display zero. Totals and event replay are unchanged.
This supersedes the sorted-display behavior in the February 18 standings spec.

## Pattern execution limits

Public session responses do not generate detailed debug traces. Legacy trace
settings and event-level pattern trace options are ignored during server replay,
and returned session configuration reports `trace: false`. Scores and stored
events remain unchanged. Direct engine callers can still request diagnostics;
the public session API does not expose a switch to enable them.

Public session creation and replay also enforce strict rule validation. Pattern
IDs must be unique and 1–96 characters long. Each pattern needs a scoring mapping;
mapping IDs must be unique, points must be finite numbers, and at most 32 mappings
are accepted. Zero-point mappings are valid. Invalid mappings are rejected before
candidate enumeration and saving, even if their pattern would have no matches.
Validation messages are deduplicated and bounded as they are collected. Existing
invalid events are preserved and return a compact error; undo can remove one from
active scoring, and redo is rejected while it remains invalid.

Pattern scoring shares a runtime work budget across all patterns and player
entries in an event, with a larger budget for replaying the session. Work includes
intermediate candidates and rejected combinations, even when a rule returns only
one match. `all` stops at its first child with no matches.

An operation exceeding the budget returns a complexity error rather than partial
scores. The server validates the complete replay before saving an event, including
redo; rejected operations leave the stored history unchanged. Existing expensive
histories also receive bounded replay. Undo can recover a session if the remaining
active events fit the limits; otherwise simplify the pattern in a new session.
Existing history is preserved. See [security limits](./security-deployment.md) and
[the regression specification](./specs/2026-10-30-scoring-work-budget.md).
