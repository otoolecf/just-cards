# Ruleset Confidence v0

This document defines bundle-level confidence checks used before paid dynamic rule generation.

## Purpose

Validate that a `runtime-bundle/v1` is not only schema-valid, but also operationally compatible with runtime and play-surface primitives.

## Evaluator

- implementation: `/Users/ConnorO/git_repos/just-cards/src/lib/rulesets/confidence.ts`
- tests: `/Users/ConnorO/git_repos/just-cards/src/lib/rulesets/confidence.test.ts`

## Confidence Check Categories

1. Bundle contract
- `runtime-bundle/v1` shape assumption

2. UI profile integrity
- `validateUiProfile(uiProfile, runtimeRulePack)` must pass
- quick targets must align with visible table zones

3. Explainability integrity
- bundle should include `ruleset-explain/v0` for layman guide UX
- objective and turn-flow fields must be non-empty
- source/audit metadata must be present for generated bundles

4. Runtime smoke simulation
- deterministic gameplay event stream is synthesized
- no gameplay or score validation issues should occur
- if end-round triggers exist, at least one generated scoring event should fire

5. Play-surface model compatibility
- play profile derived from `ui-profile/v0`
- `buildPlaySurfaceView` must succeed with non-empty labels

## Commands

- Golden extraction + compile + confidence checks:
  - `npm run test:golden`
- Bundle confidence + golden checks together:
  - `npm run test:confidence`

## Scope Boundary

This is a confidence gate, not semantic correctness proof for every game rule nuance. It is designed to catch primitive-contract regressions early and cheaply.
