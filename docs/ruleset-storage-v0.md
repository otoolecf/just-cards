# Ruleset Storage

RulesetStore is the storage boundary for validated `runtime-bundle/v1` payloads.
Game logic and generation use RulesetService and never depend directly on database APIs.

## Implemented adapters

- Vite development and unit tests: Node SQLite at `.local/rulesets.sqlite`, with
  `RULESET_SQLITE_PATH` and the explicit `RULESET_STORE_DRIVER=memory|sqlite` test override.
- Built Cloudflare Worker: `RULESETS_DB` D1 binding, through `d1-store.ts`. Missing
  deployed bindings fail explicitly; there is no deployed memory fallback.
- Reviewed presets are composed into service reads alongside the persisted catalog.

The D1 service is constructed per request from the platform binding. Only the local
service is cached globally. Browser, REST, route loaders and MCP pass the same request
platform into this service. SvelteKit's build-mode flag distinguishes Vite from the
built Worker; Wrangler local development still exercises D1.

The service/API contract provides `createDraft`, `list`, `getById`, and `updateMetadata`:
`POST /api/rulesets`, `GET /api/rulesets`, `GET /api/rulesets/{rulesetId}`, and generated
drafts at `POST /api/rulesets/generate`. Complete bundles include runtime rules,
UI profile, optional explainability and executable table policies. Parameterized
queries preserve source URLs, notes and timestamps. Duplicate IDs cannot overwrite data.

## Schema and deployment

`migrations/0001_rulesets.sql` defines the D1 schema and its ordering index.

- `npm run cf:migrate:local` applies migrations to Wrangler's local D1 simulation.
- `npm run cf:dev` builds, migrates locally and starts the complete Worker.
- `npm run cf:deploy` builds, deploys with Wrangler automatic D1 provisioning, then
  applies remote migrations. Review the deployment target before using this command.
- `npm run cf:migrate:remote` applies schema migrations to the deployed database.

Resource IDs are omitted from source config so a deployment can provision its own
binding. Wrangler writes generated database IDs to its config after provisioning.
A deployment dry-run validates packaging without publishing or provisioning resources.

The D1 adapter has contract tests against the same SQL schema. Worker browser tests
exercise the real D1 binding, import a game, reload its catalog entry, and create a
room from the stored bundle. Active rooms keep a copy of their rules so later catalog
changes cannot change games already in progress.

New imports optionally carry `generationReport` (`rule-validation/v1`) inside `runtime-bundle/v1`. Storage validates report shape and policy/scoring snapshot consistency. Review acceptance saves a new record; the original draft and room snapshots remain immutable. No adapter or SQL schema change is needed.

## Library organization (2026-09-20)

`RulesetRecord.archived` is catalog metadata. Migration `0002_ruleset_catalog.sql`
adds the D1 column; the Node SQLite adapter upgrades existing local databases.
`PATCH /api/rulesets/:id` accepts `{name, archived, expectedUpdatedAt}`. All adapters
atomically compare the timestamp and reject stale writes. Updates never modify the
canonical bundle. Built-in records cannot be renamed or archived.

`POST /api/rulesets/:id` with `{name}` duplicates any record, including built-ins,
with a new ID and copy/source notes. It preserves the validation report and readiness
gate. Duplicating a blocked draft cannot make it playable.

**Manage games** appears in Play and score setup. It supports search, duplicate,
rename, archive and restore. Archived records remain available through reads/history,
but disappear from new-game pickers and cannot create shared rooms until restored.
Existing room and score snapshots remain usable. Favorite IDs are browser-local
preferences in `jc-ruleset-favorites-v1`; both pickers put favorites first. Names and
archive flags affect the installation's shared catalog; there are no per-user accounts.

Both game pickers include **Rename or remove games**, which opens and focuses the
library. **Remove from list** archives a saved entry; **Show archived games** and
**Restore** reverse removal. Archived drafts are also hidden from the Play review
list. Built-in games remain protected.

## Permanent deletion

Archived custom entries offer **Delete permanently**, followed by a confirmation
naming the game. `DELETE /api/rulesets/:id` accepts `{expectedUpdatedAt}` and calls
`RulesetService.deleteArchived` through the store abstraction. Every adapter deletes
only a matching archived revision in one atomic operation. Active entries, stale
requests and built-ins are rejected. No schema migration is needed.

Deletion removes the catalog row and its bundle, with no library restore. Existing
rooms, score sessions and independent copies retain their own rules. Names remain
editable labels, while `id` is the stable primary key; renaming does not change it.
Built-ins remain protected templates and can be duplicated with a custom name.

The UI removes deleted entries from favorites and the local scoring catalog.
Successful online score-page loads use the complete server catalog instead of
merging missing cached records back in. Offline devices may retain old downloaded
catalogs until their next successful online load; active score snapshots stay usable.
