# UI Profile v0

This document defines the runtime UI profile primitive for ruleset-driven play rendering.

## Purpose

`ui-profile/v0` is generated and stored alongside `RuntimeRulePack` so play UI can render labels, zone visibility, quick targets, and action labels without game-specific branches.

## Schema

```ts
type UiPrimaryActionKind = 'advance_turn' | 'undo' | 'redo' | 'set_phase';
type UiCardVisibilityMode = 'public' | 'owner_only' | 'hidden';

interface UiProfileV0 {
  schemaVersion: 'ui-profile/v0';
  scorekeeper?: {
    patternRound: boolean;
  };
  hand: {
    zoneId: string;
    label: string;
    hint: string;
    quickPlayTargets: { zoneId: string; visible?: boolean }[];
    cardVisibility?: UiCardVisibilityMode;
    layout?: {
      kind: 'row' | 'grid';
      rows?: number;
      columns?: number;
    };
  };
  table: {
    zones: {
      id: string;
      label: string;
      hint: string;
      visible?: boolean;
      allowDrawFromTop?: boolean;
      drawVisibility?: 'reveal' | 'preserve';
      drawPickMode?: 'top' | 'any_visible';
      cardVisibility?: UiCardVisibilityMode;
    }[];
  };
  actions: {
    primary: (
      | { id: string; kind: 'advance_turn' | 'undo' | 'redo'; label: string }
      | { id: string; kind: 'set_phase'; phase: string; label: string }
    )[];
  };
  log: {
    label: string;
    emptyText: string;
  };
  seats?: {
    cards?: {
      zoneId: string;
      label: string;
      visible?: boolean;
      includeSelf?: boolean;
      cardVisibility?: UiCardVisibilityMode;
      layout?: {
        kind: 'row' | 'grid';
        rows?: number;
        columns?: number;
      };
    };
  };
}
```

## Validation Rules

1. `schemaVersion` must be `ui-profile/v0`.
2. Every `hand.quickPlayTargets[*].zoneId` must exist in `table.zones[*].id`.
3. When runtime gameplay rules are provided:
   - `hand.zoneId` must match `gameplayRulePack.handZoneName`.
   - each quick target must be legal in `zoneMovePolicy.targetZoneAllowlist` (excluding hand).
   - each `set_phase` action phase must exist in gameplay `phases`.
4. `layout.kind` must be one of `row|grid`; `grid` requires `columns >= 1`.
5. `table.zones[*].drawVisibility` (when provided) must be `reveal|preserve`.
6. `table.zones[*].drawPickMode` (when provided) must be `top|any_visible`.
7. `hand.cardVisibility`, `table.zones[*].cardVisibility`, and `seats.cards.cardVisibility` (when provided) must be `public|owner_only|hidden`.
8. `seats.cards.zoneId` must match either `hand.zoneId` or a declared table zone.
9. If `scorekeeper` is supplied, it must be an object with a boolean `patternRound`.
   Missing metadata means false; existing bundles remain valid.

## Generation Defaults

`generateUiProfileFromRuntime(runtimeRulePack)` derives:

1. Table zone IDs from gameplay move policy + round clear zones + trigger zone references.
2. Quick play targets from legal target zones.
3. Human-friendly labels/hints from known zone IDs plus fallback title-casing.
4. Primary actions: `advance_turn`, `undo`, `redo`.
5. `drawVisibility` defaults to `reveal` unless overridden in generated/edited profile data.
6. `drawPickMode` defaults to `top`, and is promoted to `any_visible` when gameplay draw-source policy indicates non-top visible pickup behavior.
7. Card visibility defaults:
   - `hand.cardVisibility = owner_only`
   - `table.zones[*].cardVisibility = public`
   - `seats.cards.cardVisibility = public` (when seat cards profile exists)

## Bundle Contract

Stored rulesets now use `runtime-bundle/v1`:

```json
{
  "bundleVersion": "runtime-bundle/v1",
  "gameId": "string",
  "displayName": "string",
  "runtimeRulePack": {},
  "uiProfile": {
    "schemaVersion": "ui-profile/v0"
  }
}
```

`RulesetService` accepts `runtime-bundle/v0` input for compatibility and upgrades it to v1 by generating `uiProfile`.

## Shared-room rendering (2026-09-17)

`runtimeRulePack.tableRules`, when present, is the executable behavior contract for
shared rooms. Fixed layouts render stable grid slots; hand/meld policies render
private hands and contributor-labelled public melds. Stock and discard controls
follow the policy and server stage. Only allowlisted viewer projections reach the
UI; client-side masking alone is not a privacy boundary. Existing `ui-profile/v0`
metadata remains compatible for draft previews and generated guidance. See
[Shared table v1](./shared-table-v1.md).

## Separate pattern scoring input

`scorekeeper.patternRound` controls whether a guided score session exposes the
separate pattern-round editor. This is a UI capability, not an authorization rule
or a declaration that a game has card combinations. Meld validation and Golf column
cancellation do not require this editor. Generated UI profiles enable it only when
the runtime declares a `scoringTriggers[*].scorer.kind` of `pattern`; Golf and
Rummy generate false. Authors can explicitly override the UI capability.

The value is copied into `GuidedScoreProfile.patternRound` when creating a score
session and retained on reload. Missing fields in older profiles default to false.
Raw calculator sessions keep the generic editor under collapsed **Advanced/custom
scoring**. No game-name checks are used for panel visibility.

Imported executable profiles also respect bundle-level `generationReport` readiness: the play lobby excludes unreviewed/blocked candidates, and the import/saved-draft views show rules, assumptions and evidence before enabling play. This gate does not change scorekeeper capability selection.

The import review keeps proposed play/scoring behavior visible, groups assumptions by rule category and collapses the complete assumption list and model evidence/check details for mobile reading. Acceptance is an explicit checkbox and button, disabled for blocked drafts.

Manual family variants recompile runtime/UI profiles from their edited table policy;
source game names never select a special editor. Fixed layouts expose reveal/pair
settings, hand/meld policies expose deal/ace settings, and all expose card values and
limits. Existing sessions keep a copied guided profile, including for offline replay.

## Additional table capabilities (2026-09-20)

The authoritative shared-room UI dispatches on table policy capability, not ruleset
ID: patience shows stock/waste, suited foundations and seven columns; shedding shows
private hand, public up cards, masked blind positions and the play pile; contract
shows auction, partnership progress, current/last trick, own hand and exposed dummy.
Declarer receives dummy controls only on dummy's turn. Follow-suit and valid shedding
selections gate controls; the server still validates all commands. All boards use
shared card and button primitives with keyboard/tap operation. Solitaire's seven
columns scroll within their container on narrow screens; page width stays bounded.
Physical guided scoring derives its result-entry capability from the same policy.
