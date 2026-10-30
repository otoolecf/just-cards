# Ruleset Golden Evals v0

This document defines the offline golden-eval harness used to validate ruleset extraction/compile behavior before paid LLM integration.

## Purpose

1. Lock in extraction behavior for representative card-game rule inputs.
2. Catch regressions in extraction heuristics quickly.
3. Keep eval costs near zero while refining interfaces.

## Golden source URLs and synthetic fixtures

1. `https://bicyclecards.com/how-to-play/six-card-golf`
2. `https://bicyclecards.com/how-to-play/cribbage`
3. `https://www.pagat.com/beating/shithead.html`

The URLs remain source-detection inputs. Tests use original synthetic HTML summaries,
not downloaded publisher pages, in `src/lib/rulesets/evals/fixtures`. See the
[fixture provenance](../src/lib/rulesets/evals/fixtures/README.md). These deterministic
tests do not establish compatibility with current live publisher HTML.

## Evaluation Contract

Each golden case asserts required signals such as:

- game name tokens
- player range bounds
- detected zones (`stock`, `discard`, `crib`, etc.)
- draw/play affordances
- scoring hints (for example low-score-wins)
- successful compile to `runtime-bundle/v1` + `ui-profile/v0`
- explainability payload presence (`ruleset-explain/v0`) for layman guide UX
- bundle confidence checks (runtime smoke + UI/play-surface compatibility)

## Runner

- implementation: `src/lib/rulesets/golden-evals.ts`
- tests: `src/lib/rulesets/golden-evals.test.ts`
- command: `npm run test:golden`
- bundle confidence implementation used by each case:
  - `src/lib/rulesets/confidence.ts`

## LLM Readiness Gate

Before enabling paid LLM extraction in the main path:

1. Keep this suite green.
2. Add new golden cases for each new high-priority game family.
3. Require eval pass in CI for extractor changes.
