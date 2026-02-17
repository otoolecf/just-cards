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
  };
  table: {
    zones: {
      id: string;
      label: string;
      hint: string;
      visible?: boolean;
      allowDrawFromTop?: boolean;
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
}
```

## Validation Rules

1. `schemaVersion` must be `ui-profile/v0`.
2. Every `hand.quickPlayTargets[*].zoneId` must exist in `table.zones[*].id`.
3. When runtime gameplay rules are provided:
   - `hand.zoneId` must match `gameplayRulePack.handZoneName`.
   - each quick target must be legal in `zoneMovePolicy.targetZoneAllowlist` (excluding hand).
   - each `set_phase` action phase must exist in gameplay `phases`.

## Generation Defaults

`generateUiProfileFromRuntime(runtimeRulePack)` derives:

1. Table zone IDs from gameplay move policy + round clear zones + trigger zone references.
2. Quick play targets from legal target zones.
3. Human-friendly labels/hints from known zone IDs plus fallback title-casing.
4. Primary actions: `advance_turn`, `undo`, `redo`.

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
