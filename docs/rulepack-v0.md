# RulePack v0 (Canonical Rule IR)

This document defines the current canonical internal rule format used by the scorekeeper engine.

## Goals

1. Keep parser output deterministic and typed.
2. Keep engine input stable and versioned.
3. Separate rule execution into explicit stages.
4. Support explainable scoring decisions.

## Schema Identity

- `schemaVersion`: must be `rulepack/v0`
- `capabilities`: explicit list of engine features the pack depends on

## Core Shape

`RulePack` currently includes:

- Base values:
  - `baseAceValue`
  - `rankValues` (`2..10,J,Q,K`)
- Value modifiers:
  - ordered `modifiers[]`
  - each has:
    - `id`
    - `when` predicate
    - `operation` (`set|add|multiply|clamp_min|clamp_max`)
- Resolution policy:
  - `modifierResolution`: `last_match_wins | first_match_wins`
- Validation contract:
  - Imported canonical JSON schema at `src/lib/scorekeeper/rulepack-schema.json`
  - `rulepack/v0` payloads are validated at runtime before scoring

## Rule Pipeline

Execution is modeled as five stages:

1. `validate`
   - Validate schema/version/capability consistency.
2. `detect`
   - Determine which predicates match each card/context.
3. `score`
   - Apply operation algebra to produce card value deltas.
4. `route`
   - Route deltas to scoring targets (`player|team|pool`).
5. `settle`
   - Execute settlement rules (for now, pool transfer events).

## Operation Algebra

Supported operation kinds:

- `set(value)`
- `add(value)`
- `multiply(value)`
- `clamp_min(value)`
- `clamp_max(value)`

This allows non-trivial scoring transforms while staying deterministic.

## Runtime Validation

`validateRulePack` performs two stages:

1. JSON schema conformance against `rulepack/v0`.
2. Cross-feature semantic checks (for example required capabilities for non-set operations).

Schema violations emit `schema:*` issue codes and prevent scoring when schema errors exist. In strict mode, schema failures throw an error.

Semantics-only issues (like missing capability markers) still allow scoring, while preserving diagnostics, unless strict mode is enabled.

## Context Contract

Rule evaluation can consume `RuleEvalContext`:

- `phase` (string)
- `actorRole` (string)
- `tags` (string[])

Current predicate support includes `context_has_tag`.

## Scoring Targets

Routing supports:

- `player:<id>`
- `team:<id>`
- `pool:<id>`

`pool` targets are designed for kitty/crib-style accumulation before settlement.

## Settlement (v0)

Current settlement primitive:

- `settle_pool`:
  - `fromPoolId`
  - `toTarget`
  - optional `amount`

If `amount` is omitted, full pool balance is transferred.

### Pattern-Scored Rounds (v0)

The score keeper now supports pattern-driven scoring in a dedicated event form:

- `type: add_pattern_round`
- `patternPack: PatternRulePack` (from gameplay v0)
- `patternScoring: PatternScoringRule[]` (`patternId -> points`)
- `entries` scoped to scoring targets (`player|team|pool`)

Pattern matches are detected by `detectPatterns` and then scored by
`patternScoring` mapping inside `deriveState` for the round.

## Explainability / Trace

`deriveState(..., { trace: true })` emits stage entries:

- `validate`
- `detect`
- `score`
- `route`
- `settle`

This is intended for debugging and later UI explanations.

## Capabilities

Current capability values:

- `value:base-ranks`
- `value:modifier-set`
- `value:op-algebra`
- `routing:target-kinds`
- `settlement:pool-transfer`
- `trace:explain`
- `resolution:first-match`

Validation checks that required capabilities exist for used features.

## Gameplay v0 Capabilities (active)

- `pattern:count`
- `pattern:all_same_rank`
- `pattern:run`
- `pattern:all_same_suit`
- `pattern:contains`
- `composition:all`
- `composition:any`

Gameplay validation capabilities are defined in
[`specs/2026-02-16-gameplay-v0-validator.md`](./specs/2026-02-16-gameplay-v0-validator.md).

## Example: Rummy-Style Modifier Pack

```ts
const rules = createRulePack({
	modifiers: [
		{ id: 'non-face-five', when: { kind: 'is_face', value: false }, value: 5 },
		{ id: 'two-minus-two', when: { kind: 'rank_is', rank: '2' }, value: -2 }
	]
});
```

## Example: Crib/Kitty Settlement

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

## v0 Boundaries

Not yet fully implemented in engine:

- Rich trigger orchestration beyond event ordering
- Multi-condition predicates (`AND`/`OR`) and expression trees
- Percentage/split settlement operations
