# Ruleset generation

The current import contract is `rule-extraction/v1`, compiled into the existing
`runtime-bundle/v1`. `RuleFacts v0` remains an internal compilation intermediate.
See the [implementation spec](./specs/2026-09-17-structured-rule-extraction.md).

## Shared contract

`src/lib/gameplay/policy-schema.ts` defines the described executable policy schema.
The engine's `validateTableRules` uses that schema and additional compatibility checks.
`src/lib/rulesets/extraction-contract.ts` wraps it with complete rank values, source
quotations, explicit assumptions, unresolved ambiguities and unsupported mechanics.

The exact schema and extraction instructions are available through:

- HTTP: `GET /api/rulesets/schema`
- MCP resource: `just-cards://schemas/rule-extraction-v1`

Every object rejects unknown fields. Structured-output nullable policy fields are
omitted in runtime storage. A single standard deck, fixed grids and private hands
with sets/runs are supported. Trick taking, bidding, wild cards, teams, recycling
stock and other absent mechanics must be declared unsupported, not approximated.
The schema descriptions document fixed behavior as well as configurable fields.

## Pipeline

1. Ingest a specific URL or pasted text. Isolate article content, reject directories,
   cap downloads at 2 MB, use a 15-second fetch timeout and a 24,000-character text budget.
2. With a configured model, extract the full executable policy using strict JSON
   Schema output. A recognized game never bypasses this step. Source text is data,
   not instructions; no generated code is evaluated.
3. Validate the structure and policy combinations. Compile supported data through
   the existing facts/compiler into deterministic runtime and UI primitives.
4. Make a separate model call to review the candidate against the source and the
   primitive descriptions. It checks omitted mechanics, contradictions and hidden
   defaults. This is independent of the extraction conversation, but is not proof
   of correctness or a human review.
5. Run the actual table-engine behavioral suite. Check quotations occur in the
   source and each executable leaf has evidence or an explicit assumption.
6. Repair once for structural failures or hard review failures, then review again.
   Malformed extraction can escalate from the primary to the fallback model.
   Each HTTP model request has a 45-second timeout. The default nano/mini models use low reasoning effort, with 12,000 extraction and 4,000 review completion-token limits. There is no unbounded retry loop.
7. Persist the candidate and its `generationReport` through `RulesetService`.

The website and MCP session/server generation use `generateRulesetDraftWithAgent`.
A session sampler receives the same schema, instructions, source, stage and repair
issues. The default MCP server has no session sampler; it transparently uses the
server provider. Source ingestion failures remain errors, not guessed games.

Without a model/key, or after all structured extraction attempts fail, the basic
heuristic parser produces a clearly labelled unreviewed draft. Unsupported or
contradictory model candidates remain visible drafts; they are not overwritten
with a guessed family preset.

## Behavioral checks and their limits

`behavioral-validation.ts` runs deterministic engine scenarios and two fixed seeds
at every supported player count, with a 256-command bound per simulation:

- deal counts and opening reveals;
- wrong-player, wrong-phase and invalid-selection rejection with atomicity;
- top/suffix discard pickup and immediate use;
- supported meld and layoff transitions;
- card conservation and viewer privacy;
- independent arithmetic for rank values, column cancellation and contributor credit;
- complete rounds, going out, stock exhaustion, cumulative limits and winners;
- deterministic replay and next-round dealer/score preservation.

The independent scoring oracle does not call the engine's scoring helpers. Seeded
play exercises completion, not optimal strategy or exhaustive exploration. These
checks establish engine compatibility, not whether a source sentence was correctly
interpreted. Curated engine/family regression tests complement per-import checks.

## Readiness and review

The stored `generationReport` uses `rule-validation/v1`:

- `ready`: supported rules, passing behavior, source review consistent and no
  missing evidence/defaults; or an explicitly accepted supported draft.
- `needs_review`: behavior passes, but there are assumptions, missing evidence or
  unavailable/uncertain source review.
- `blocked`: engine failure, unsupported mechanics, unresolved ambiguities,
  fabricated evidence or source contradictions. These cannot be waived.

The report includes the precise policy/scoring snapshot it validates. Room creation
checks readiness and snapshot consistency. `POST /api/rulesets/:id/review` requires
`{accept:true, policySnapshot}` and reruns behavior checks before saving an immutable
accepted copy. Editing the policy invalidates its report. No room event log changes.
The report survives SQLite/D1 persistence with the bundle; no SQL migration is needed.

The Play importer and saved draft page show a plain-language rule summary, rank
values, assumptions, blockers and expandable evidence/checks. Only ready rulesets
appear in room creation. Drafts remain available under “Imported drafts to review.”
Builtin presets and legacy bundles retain existing behavior; existing rooms keep
their immutable original bundle. Score-only drafts remain visibly unreviewed.

MCP `validate_ruleset` exposes `behavior`, `playable` and the stored report separately.
Its `pass` requires both passing behavior and readiness for new imports. Legacy
prototype bundles still use the older confidence checks; prototype MCP game tools
are separate from authoritative shared rooms.

## API and configuration

`POST /api/rulesets/generate` accepts `{source:{type:'url',url},name?,notes?}` or
`{source:{type:'text',text},name?,notes?}`. It returns the persisted ruleset, internal
facts, diagnostics and pipeline attempts. The report is in `ruleset.bundle.generationReport`.

- `OPENAI_API_KEY`: enables the server model path (local `.dev.vars`, deployed secret).
- `RULESET_LLM_PRIMARY_MODEL`: optional override, default `gpt-5-mini`.
- `RULESET_LLM_FALLBACK_MODEL`: optional override, default `gpt-5-mini`.

The API uses OpenAI's [structured output contract](https://developers.openai.com/api/docs/guides/structured-outputs).
Refusals, incomplete responses and invalid JSON never become successful extractions.
Provider response bodies are not copied into diagnostics.

Reviewed Bicycle snapshots remain a disclosed availability fallback for Golf and
500 Rum when the reference site returns 403, 429 or selected temporary failures.
They are paraphrases reviewed on 2026-09-17, not live page content. Snapshot diagnostics
remain visible. Other blocked sources require pasted rules.

Run `npm test`, `npm run check`, `npm run build` and the Playwright import/review flow.
Model transport tests use controlled responses, so a passing suite does not by itself establish live-provider extraction quality. Live evaluations require configured credentials and should inspect extraction, source review and behavioral results separately.

The default primary and fallback are both `gpt-5-mini` and deduplicated into one provider sequence; operators may configure a different fallback. Live Golf and Rummy checks motivated this default: mini produced valid policies while nano failed compatibility checks.

### New curated game families (2026-09-20)

The shared table schema now describes patience, shedding and rubber-contract
capabilities. Built-in presets exercise these through separate engine regression
tests. The import-time `evaluateTableBehavior` gate explicitly blocks these new
capabilities pending dedicated import-simulation coverage; it never runs grid/meld
checks and calls a Bridge/Palace/Solitaire extraction ready. Built-ins and supported
Palace house-rule switches remain playable.
