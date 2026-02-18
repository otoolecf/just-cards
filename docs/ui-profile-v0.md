# UI Profile v0

This document defines the runtime UI profile primitive for ruleset-driven play rendering.

## Purpose

`ui-profile/v0` is generated and stored alongside `RuntimeRulePack` so play UI can render labels, zone visibility, quick targets, and action labels without game-specific branches.

## Schema

```ts
type UiPrimaryActionKind = 'advance_turn' | 'undo' | 'redo' | 'set_phase';

interface UiProfileV0 {
  schemaVersion: 'ui-profile/v0';
  hand: {
    zoneId: string;
    label: string;
    hint: string;
    quickPlayTargets: { zoneId: string; visible?: boolean }[];
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
6. `seats.cards.zoneId` must match either `hand.zoneId` or a declared table zone.

## Generation Defaults

`generateUiProfileFromRuntime(runtimeRulePack)` derives:

1. Table zone IDs from gameplay move policy + round clear zones + trigger zone references.
2. Quick play targets from legal target zones.
3. Human-friendly labels/hints from known zone IDs plus fallback title-casing.
4. Primary actions: `advance_turn`, `undo`, `redo`.
5. `drawVisibility` defaults to `reveal` unless overridden in generated/edited profile data.

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
