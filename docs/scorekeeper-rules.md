# Scorekeeper Rule Abstraction

This document explains how score calculation works in the current scorekeeper engine and how to customize it for different games.

For the canonical versioned Rule IR contract, see:
`/Users/ConnorO/git_repos/just-cards/docs/rulepack-v0.md`

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
