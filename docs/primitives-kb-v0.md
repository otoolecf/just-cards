# Primitives KB v0

This document is the canonical knowledge base for generating `just-cards` rulesets from LLM/SLM output.

Use it as source-of-truth for:

1. Allowed primitive shapes.
2. Allowed enum values.
3. Composition flow between gameplay, validation, pattern detection, scoring, and runtime triggers.

## Versioning and Scope

- Runtime target: current backend implementation in `src/lib`.
- Rule generation target: data-first runtime bundles (no per-game hardcoded branches).
- Version family in use:
  - score rules: `rulepack/v0`
  - gameplay rules: `gameplay/v0`
  - play validator: `validator/v0`
  - pattern detector: `pattern/v0`

Persistence of generated bundles is handled through `RulesetStore` abstraction;
see `/Users/ConnorO/git_repos/just-cards/docs/ruleset-storage-v0.md`.

## Shared Card and Target Types

```ts
type CardRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
type CardSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

interface CardInput {
  rank: CardRank;
  suit?: CardSuit;
  tags?: string[];
}

type ScoringTargetKind = 'player' | 'team' | 'pool';
interface ScoringTarget {
  kind: ScoringTargetKind;
  id: string;
}
```

## ScoreEvent Primitives

`ScoreEvent` is the scorekeeper event log input.

```ts
type ScoreEvent =
  | { type: 'add_round'; playerCards: Record<string, CardInput[]> }
  | { type: 'add_round'; entries: { target: ScoringTarget; cards: CardInput[] }[] }
  | {
      type: 'add_pattern_round';
      patternPack: PatternRulePack;
      patternScoring: { patternId: string; points: number }[];
      entries: { target: ScoringTarget; cards: CardInput[] }[];
      matchOptions?: PatternMatchOptions;
    }
  | { type: 'add_delta'; entries: { target: ScoringTarget; delta: number }[] }
  | { type: 'settle_pool'; fromPoolId: string; toTarget: ScoringTarget; amount?: number }
  | { type: 'undo' }
  | { type: 'redo' };
```

### Score Primitive Semantics

- `add_round`: score by card values from `RulePack`.
- `add_pattern_round`: detect patterns then map pattern IDs to points.
- `add_delta`: manual/derived signed point deltas (works with or without gameplay state).
- `settle_pool`: transfer from `pool:<id>` to target.
- `undo` / `redo`: replay-level mutation cursor for deterministic derivation.

## GameEvent Primitives

`GameEvent` is the gameplay-state event log input.

```ts
type GameEvent =
  | { type: 'init_game'; players: string[]; turnOrder?: string[]; dealerIndex?: number }
  | { type: 'start_round'; roundIndex?: number }
  | { type: 'set_phase'; phase: string }
  | { type: 'deal_cards'; playerId: string; cards: CardInput[]; zone?: string }
  | {
      type: 'zone_move';
      actorId: string;
      from: { kind: 'player'; playerId: string; zone: string } | { kind: 'table'; zone: string };
      to: { kind: 'player'; playerId: string; zone: string } | { kind: 'table'; zone: string };
      cards: CardInput[];
    }
  | { type: 'advance_turn' }
  | { type: 'end_round' }
  | { type: 'undo' }
  | { type: 'redo' };
```

### Gameplay Rule Pack Keys

- `schemaVersion: 'gameplay/v0'`
- `phases`, `startingPhase`, `phaseTransitions`
- `turnPolicy.direction` in `{ 1, -1 }`
- `zoneMovePolicy`:
  - `allowedPhases`
  - `actorMustBeCurrentPlayer`
  - `sourceMustBelongToActor`
  - `sourceZoneAllowlist`
  - `targetZoneAllowlist`
  - `minCards`
  - `maxCards?`
- `roundPolicy`:
  - `enabled`
  - `rotateDealerBetweenRounds`
  - `clearTableZonesOnRoundStart`

## ValidatorRulePack Primitive

Use validator rules to declare legal/illegal plays independent of game-specific code.

```ts
interface ValidatorRulePack {
  schemaVersion: 'validator/v0';
  capabilities: ValidatorCapability[];
  rankOrder: string[];
  canPlay: PlayRule[];
  requireRules?: boolean;
}
```

### ValidatorCapability Enum

- `pattern:count`
- `pattern:all_same_rank`
- `pattern:run`
- `pattern:same_suit`
- `pattern:contains`
- `composition:all`
- `composition:any`
- `trace:explain`

### PlayMatch Kinds

- `card_count`
- `all_same_rank`
- `all_same_suit`
- `run`
- `contains`
- `all`
- `any`

### Rule Predicate Keys

- `phase?: string[]`
- `actorMustBeCurrentPlayer?: boolean`
- `actionTypes?: string[]`

### Gameplay Integration

`deriveGameState` supports optional validator enforcement for `zone_move`:

```ts
deriveGameState(events, gameplayRulePack, {
  playValidation: {
    rulePack: validatorRulePack,
    zoneMoveActionType: 'meld'
  }
});
```

## PatternRulePack Primitive

Pattern detector is independent and reusable by score or gameplay orchestration.

```ts
interface PatternRulePack {
  schemaVersion: 'pattern/v0';
  capabilities: PatternDetectorCapability[];
  rankOrder: string[];
  patterns: PatternRule[];
  requirePatterns?: boolean;
}
```

### PatternDetectorCapability Enum

- `pattern:count`
- `pattern:all_same_rank`
- `pattern:run`
- `pattern:all_same_suit`
- `pattern:contains`
- `composition:any`
- `composition:all`
- `trace:explain`

### PatternMatchKind Kinds

- `card_count`
- `all_same_rank`
- `all_same_suit`
- `run`
- `contains`
- `all`
- `any`

## RuntimeEvent and RuntimeRulePack Primitives

Runtime module composes gameplay + score primitives in one deterministic derivation pass.

```ts
type RuntimeEvent =
  | { type: 'gameplay'; event: GameEvent }
  | { type: 'score'; event: ScoreEvent }
  | { type: 'manual_score'; entries: { target: ScoringTarget; delta: number }[] };

interface RuntimeRulePack {
  gameplayRulePack?: GameplayRulePack;
  validatorRulePack?: ValidatorRulePack;
  validatorZoneMoveActionType?: string;
  scoreRulePack?: RulePack;
  scoringTriggers?: RuntimeScoringTrigger[];
}
```

## RuntimeScoringTrigger Primitive

Trigger rules convert gameplay events into generated score events.

```ts
interface RuntimeScoringTrigger {
  id: string;
  when: {
    eventType: 'init_game' | 'start_round' | 'set_phase' | 'deal_cards' | 'zone_move' | 'advance_turn' | 'end_round';
    phases?: string[];
    fromZones?: string[];
    toZones?: string[];
  };
  source:
    | { kind: 'event_cards' }
    | { kind: 'player_zone'; zone: string; players: 'all' | 'actor' | 'current_player' | string[] };
  scorer:
    | { kind: 'card_values' }
    | { kind: 'pattern'; patternPack: PatternRulePack; patternScoring: { patternId: string; points: number }[]; matchOptions?: PatternMatchOptions }
    | { kind: 'fixed'; points: number };
  target:
    | { kind: 'actor' }
    | { kind: 'source_player' }
    | { kind: 'static'; target: ScoringTarget };
}
```

### Trigger Mapping Rules

- `source.kind = event_cards`:
  - supported event types: `zone_move`, `deal_cards`
- `source.kind = player_zone`:
  - cards are fetched from derived gameplay state at trigger time
- `target.kind = actor`:
  - requires event actor field (`zone_move`)
- `target.kind = source_player`:
  - uses source player for sampled cards
- `scorer.kind = card_values`:
  - emits generated `add_round`
- `scorer.kind = pattern`:
  - emits generated `add_pattern_round`
- `scorer.kind = fixed`:
  - emits generated `add_delta`

## Rule Generation Output Contract

LLM/SLM should generate one runtime bundle with this top-level shape:

```json
{
  "bundleVersion": "runtime-bundle/v0",
  "gameId": "string",
  "displayName": "string",
  "runtimeRulePack": {
    "gameplayRulePack": {},
    "validatorRulePack": {},
    "validatorZoneMoveActionType": "string",
    "scoreRulePack": {},
    "scoringTriggers": []
  }
}
```

### Generation Requirements

1. Use only declared enum values and primitive shapes from this document.
2. Avoid game-name conditionals in runtime code paths.
3. Prefer composition:
   - legality in `validatorRulePack`
   - card combinations in `patternPack`
   - scoring time in `scoringTriggers`
   - arithmetic in `scoreRulePack` operations
4. Represent manual-only scoring paths with `add_delta` / `manual_score` support.

## Game Mapping Guidance (Primitive-Level)

- Six-Card Golf:
  - card values via `scoreRulePack`
  - set/pair style bonuses/penalties via `pattern` scorer triggers
  - round-end hand scoring via `player_zone` source on `end_round`
- Cribbage:
  - fifteens/runs/pairs as pattern rules
  - scoreboard adjustments as `add_delta` where needed
- 500 Rummy:
  - meld legality via `validatorRulePack` (`any` run/set)
  - layoff/meld scoring via trigger-based scoring and/or manual deltas
- Texas Hold'em:
  - hand-rank/pot settlement can be modeled with pattern/fixed/manual deltas
  - betting/side-pot complexity likely needs future settlement primitives

## Known Boundaries (Current)

- No expression-tree predicates for score modifiers yet (`AND`/`OR` at score-predicate level).
- No percentage/split settlement primitive yet (only direct pool transfer).
- Runtime trigger conditions are finite (event type, phase, optional zone filters).
- Poker betting rounds, side pots, and showdown resolution are not yet first-class primitives.
