# Security deployment and operations

Application safeguards and operator responsibilities for a hosted installation.
Repository configuration does not establish which settings are enabled in a live
Cloudflare dashboard; verify those settings for your own deployment.

## Upgrading installations with legacy resource IDs

Existing entries from the previous JSON registry migrate automatically to indexed rows.
On installations without that registry, it starts empty. Existing Durable Object data is preserved,
but old rooms/sessions return 404 until their known IDs are registered. Inventory
active/saved IDs from trusted device records before deployment. After deployment,
sign in as owner and POST JSON `{ "id": "room:ABCD1234" }` or
`{ "id": "score:sess-..." }` to `/api/owner/resources` from the same origin.
This endpoint shares the creation budget (five per address per hour). Plan a staged
migration for larger installations; do not deploy blindly over an active family game.
Registration does not create, overwrite or expose game contents. Unknown IDs stay
unregistered. There is no destructive automatic history migration.

## Application limits

Production admission is serialized in RoomAdmission SQLite and fails closed:
- Platform request limiter: 1,200 requests per address per minute shared by APIs,
  sockets and database-backed pages (`/`, `/play`, `/play/[rulesetId]`). Page HTML,
  HEAD and SvelteKit data requests use resolved route IDs and are admitted before
  loaders or database queries; static assets do not consume this allowance.
  Cloudflare enforces this per location, not as a strict worldwide billing cap.
  Protected requests fail closed if the binding is missing.
- Discovery: 60 unknown-ID lookups per hashed address per minute and 10,000
  globally per minute. This budget cannot consume existing-resource allowances.
- Existing resources: 6,000 operations per resource per minute; there is no shared
  global daily read cutoff. Client floods are also limited by the platform binding.
- Five new room/score IDs per address per hour; 100 globally per day.
- At most 10,000 committed IDs plus live reservations, and 2,000 concurrent
  discovery-client windows. Failed creation consumes a creation-rate allowance
  but releases its ID reservation. Crashed reservations expire after ten minutes.
  Only a matching, unexpired lease can commit; pending IDs are not publicly routed.
  Committed registry entries are retained; this is a
  lifetime registry-count ceiling, not a billing cap or automatic deletion system.
- Existing active-room capacity and idle policies still apply.
- API bodies: 16 KB for room routes; 64 KB otherwise, counted while streaming.
- AI entry points: 20 POST requests per day and two concurrent requests globally;
  abandoned request leases expire after ten minutes. Provider token ceilings remain
  per call, so configure provider budgets too.
- Score settings/events: 16,000 serialized characters; 1,000 events and 256 KB serialized history per session. Shared tables stop growing
  at 2,000 events or 512 KB; start a new game at that point.
- Public score session replay/views disable detailed traces, including legacy
  `config.trace` and event-level pattern trace options. Returned configuration
  reports `trace: false`. Existing settings/events remain stored unchanged; no
  migration is needed and score totals are unaffected. Internal engine diagnostics
  are separate from the public session API.
- Score validation is strict during public creation, append and replay. Pattern
  IDs and mapping IDs are limited to 96 characters; at most 32 scoring mappings
  are accepted, with unique IDs and finite numeric points. Every pattern needs a
  mapping before enumeration. Invalid inputs return a compact 400 error before
  saving. Diagnostics are deduplicated during collection and bounded to 32 items,
  256 characters per message, 64 per code and 96 per rule ID. Legacy invalid
  events remain stored and return compact errors; undo can recover an invalid
  event if the remaining history is valid, while invalid redo is rejected.
- Pattern detection: 52 cards, 32 pattern nodes, depth eight, and a 10,000-candidate
  preflight estimate. Actual enumeration, combination attempts (including rejected
  overlaps), candidate processing and sorting also consume a runtime budget:
  10,000 work units shared by all patterns/entries in a scoring event and 100,000
  across a complete replay. Empty children short-circuit `all` evaluation.
  Exhaustion returns HTTP 400 with a complexity error, never partial totals.
  Appends validate replay before saving, so rejected events leave history intact.
  Reads of legacy expensive histories fail with the same controlled error; no
  data is automatically deleted. Simplify the scoring pattern or start a new
  session when full. An undo can recover a legacy session if the remaining active
  events fit the budget; redo is validated before it can restore expensive work.

Local Vite uses local storage without distributed resource admission; verify
production admission using an isolated Wrangler instance. Configure
`PUBLIC_WRITES_ENABLED=false` to pause API writes (owner session/migration endpoints
remain available). This does not stop reads, socket connections or existing alarms.

## Operator configuration

- Verify the deployed owner key is random, at least 32 characters, and set as a
  secret. Enable repository secret scanning/private vulnerability reporting.
- Apply WAF/rate limits to all hostnames, including workers.dev and preview routes,
  or disable alternate hostnames. Protect owner login and request floods at the edge.
- Confirm the configured 1,000 ms request CPU ceiling and 10% log sampling work for
  normal games. Alerts are not hard billing caps.
- Set provider-side AI budgets and usage alerts; configure Cloudflare usage alerts
  for Workers, Durable Objects, D1 and logs. Check alert delivery.
- Plan explicit retention/export/deletion for stored games. Current hard count/event
  ceilings bound growth but do not remove expired records.
- Re-run Gitleaks on all final refs and a source-only export; never publish a zip
  containing ignored environment files or game databases.

## Remaining follow-up

Catalog reads are bounded to 100 records per page in both database adapters.
The API returns nextOffset and accepts offset; the play lobby offers Load more
games. The score picker initially receives the first page. Metadata-only loading
remains a follow-up because current selectors require complete rule bundles. Exact AI token accounting,
automatic record retention, source-fetch destination/redirect restrictions and
live edge/dashboard verification remain follow-up work. Do not describe these as
deployed protections.

## MCP limitations

- Widget HTML still interpolates untrusted player/ruleset names, labels and status
  strings into markup. Safe text/attribute construction and browser regressions
  remain required. Owner authentication does not make that data trusted; prefer
  structured MCP tools with untrusted inputs. Host sandbox restrictions are not a
  substitute for fixing template rendering.
- JSON-RPC batch requests count as one HTTP AI admission request even when they
  contain multiple generation tool calls. Per-request concurrency/admission does
  not provide a per-call token-spend ceiling. Configure provider-side budgets;
  tool-call accounting across batches remains follow-up work.

## Verification

Run `npm test`, `npm run check`, `npm run build` and `npm audit`. CI runs these checks
and a full-history Gitleaks scan. The audit job fails on high/critical advisories;
remaining lower-severity advisories require review rather than silent dismissal.

## Routing and registry invariants

All API guards use the resolved SvelteKit route, including encoded URLs. Registry
rows and rate-counter rows are stored separately; denied requests do not rewrite
state. Expired rows are pruned on successful admissions. Old registry entries are
preserved during migration because their backing game existence cannot safely be
inferred from the old registry alone; no existing game data is deleted.

Named Wrangler environments must include the API_RATE_LIMIT binding too. See
[Cloudflare rate-limit semantics](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
