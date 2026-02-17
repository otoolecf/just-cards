# Ruleset Explainability v0

This document defines the optional `ruleset-explain/v0` payload attached to `runtime-bundle/v1` bundles.

## Purpose

Lay users should be able to understand:

1. What the objective is.
2. How a turn generally works.
3. How scoring works.
4. What each table zone means.
5. Where the rules came from and when they were generated.

## Bundle Field

`RuntimeRulesetBundle.explain?: RuntimeRulesetExplainV0`

```ts
interface RuntimeRulesetExplainV0 {
  schemaVersion: 'ruleset-explain/v0';
  goal: string;
  playerRange: { min: number; max: number };
  rounds?: number;
  turnFlow: {
    drawFrom: string[];
    playTo: string[];
  };
  scoring: {
    lowScoreWins: boolean;
    aceValue: number;
    rankOverrides: Array<{ rank: string; value: number }>;
  };
  zones: Array<{ id: string; label: string; hint: string }>;
  diagnostics: string[];
  source: {
    type: 'url' | 'text';
    url?: string;
  };
  generatedAt: string;
}
```

## UI Usage

Play UI reads this payload to render a `Guide` tab with:

- objective
- quick start steps
- scoring highlights
- zone guide
- audit trail and diagnostics

If `explain` is absent, UI falls back to runtime + ui-profile-derived generic guidance.

## Confidence Expectations

The confidence suite checks explainability presence and coherence for generated bundles.
