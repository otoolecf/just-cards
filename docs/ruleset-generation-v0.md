# Ruleset Generation v0

This document defines the deterministic generation scaffold that converts source rules input into persisted runtime bundles.

## Goal

Support end-to-end generation from either:

1. URL input (`source.type = url`)
2. Free-form prose (`source.type = text`)

Output is always a validated `runtime-bundle/v1` stored via `RulesetService`.

## Pipeline

1. Ingest
- URL mode: fetch source, normalize HTML/text into plain text.
- Text mode: normalize whitespace and punctuation noise.

2. Extract
- Build `RuleFacts v0` from normalized text:
  - game identity
  - player count range
  - rounds/deals hints
  - zone inventory
  - turn draw/play semantics
  - scoring hints/overrides
  - diagnostics

3. Compile
- Convert `RuleFacts v0` to:
  - `runtimeRulePack`
  - `uiProfile` (`ui-profile/v0`)
- Package as `runtime-bundle/v1`.

4. Validate + Persist
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
  "facts": { "schemaVersion": "rule-facts/v0" }
}
```

## Current Boundaries

1. Extraction is heuristic and deterministic; no external LLM call yet.
2. Ambiguous prose is tolerated via diagnostics + safe defaults.
3. Advanced betting/side-pot/team settlement semantics are flagged in diagnostics but not fully modeled.
4. Confidence is currently gated by the offline golden eval suite:
   - `npm run test:golden`
   - fixture links documented in `/Users/ConnorO/git_repos/just-cards/docs/ruleset-golden-evals-v0.md`

## Next Upgrade Path

1. Swap extraction stage with LLM/SLM extraction to `RuleFacts v0`.
2. Keep compile/validate/persist stages unchanged.
3. Add simulation + repair loop before persistence for low-confidence cases.
