# Ruleset Generation v0

This document defines the ruleset generation scaffold that converts source rules input into persisted runtime bundles.

## Goal

Support end-to-end generation from either:

1. URL input (`source.type = url`)
2. Free-form prose (`source.type = text`)

Output is always a validated `runtime-bundle/v1` stored via `RulesetService`.

## Pipeline

1. Ingest
- URL mode: fetch source, normalize HTML/text into plain text.
- Text mode: normalize whitespace and punctuation noise.

2. Baseline Extract (deterministic)
- Build a baseline `RuleFacts v0` from normalized text:
  - game identity
  - player count range
  - rounds/deals hints
  - zone inventory
  - turn draw/play semantics
  - scoring hints/overrides
  - diagnostics

3. LLM Agent Extract + Repair (optional)
- If `OPENAI_API_KEY` is available:
  - extraction attempt with primary model (default `gpt-5-nano`)
  - local quality + confidence evaluation
  - repair attempt on the same model if needed
  - escalation to fallback model (default `gpt-5-mini`) when primary output is unusable
  - deterministic fallback if no model attempt yields a serviceable result
- If key is not available, deterministic baseline is used directly.

4. Compile
- Convert `RuleFacts v0` to:
  - `runtimeRulePack`
  - `uiProfile` (`ui-profile/v0`)
  - `explain` (`ruleset-explain/v0`)
- Package as `runtime-bundle/v1`.

5. Validate + Persist
- Submit draft through `RulesetService.createDraft`.
- Existing runtime and UI-profile validation contracts are enforced.

## RuleFacts v0 Shape

```ts
interface RuleFactsV0 {
  schemaVersion: 'rule-facts/v0';
  gameName: string;
  gameSlug: string;
  players: { min: number; max: number };
  rounds?: number;
  handZoneName: string;
  zones: string[];
  turn: {
    drawSources: string[];
    playTargets: string[];
  };
  scoring: {
    lowScoreWins: boolean;
    aceValue: number;
    rankOverrides: Partial<Record<'A'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K', number>>;
  };
  diagnostics: string[];
  source: {
    type: 'url' | 'text';
    url?: string;
  };
}
```

## API Contract

Endpoint:
- `POST /api/rulesets/generate`

Payload:

```json
{
  "source": {
    "type": "url",
    "url": "https://example.com/how-to-play/..."
  },
  "name": "Optional ruleset name",
  "notes": "Optional notes"
}
```

or

```json
{
  "source": {
    "type": "text",
    "text": "free-form rule prose"
  }
}
```

Response:

```json
{
  "ruleset": { "id": "...", "bundle": { "bundleVersion": "runtime-bundle/v1" } },
  "diagnostics": [],
  "facts": { "schemaVersion": "rule-facts/v0" },
  "pipeline": { "strategy": "llm", "model": "gpt-5-nano", "attempts": [] }
}
```

## Current Boundaries

1. LLM extraction is bounded to `RuleFacts v0`; compile/validate/persist contracts remain deterministic.
2. Ambiguous prose is tolerated via diagnostics + safe defaults.
3. Advanced betting/side-pot/team settlement semantics are flagged in diagnostics but not fully modeled.
4. Confidence is gated by the offline golden eval suite and runtime confidence checks:
   - `npm run test:golden`
   - `npm run test:confidence`
   - fixture links documented in `/Users/ConnorO/git_repos/just-cards/docs/ruleset-golden-evals-v0.md`

## Runtime Configuration

- `OPENAI_API_KEY`: enables LLM extraction path.
- `RULESET_LLM_PRIMARY_MODEL`: optional override (default `gpt-5-nano`).
- `RULESET_LLM_FALLBACK_MODEL`: optional override (default `gpt-5-mini`).

## Next Upgrade Path

1. Add provider abstraction so Workers AI and other model hosts can share the same extraction contract.
2. Add richer structured scoring primitives (teams, side-pots, settlement policies) in extraction output.
3. Add low-confidence human-review gating before draft creation in production environments.
