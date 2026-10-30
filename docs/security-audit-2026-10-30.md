# Pre-publication security audit — 2026-10-30

Recommendation: fix findings 1–4 before broadly exposing the deployment. No credentials were detected in the scanned source/history, but that is not a guarantee that every possible secret format is absent. Source publication and safe operation of a public deployment are separate decisions.

Implementation follow-up: see [hardening spec](./specs/2026-10-30-public-security-hardening.md) and [deployment requirements](./security-deployment.md). Findings below describe the audited pre-fix revision, not a verification of the live deployment.

## Scope and verification

- Reviewed HEAD `65f0a6d7dc29fb3b98634a8dd0d1c96aaed94c12` and the working tree, including existing uncommitted branding changes.
- Reviewed public API routes, owner authorization, score persistence/replay, room admission, WebSockets, ruleset storage/import, client links, logging, and deployment configuration.
- Gitleaks **8.30.1**, default rules, full redaction: **zero findings** in all **23 reachable commits**, including local Codex refs; **zero findings** in a source-only export of **355 files**, including untracked, non-ignored additions.
- Supplementary pattern/path checks covered **1,065 reachable Git objects**, common provider credentials/private keys, credential assignments, and deployment-ID fields. Assignment candidates were in examples/docs/tests; no additional credential leak was established.
- Two configured local secret values were also compared directly against historical blob contents without printing their values: no matches. Including reflog commits produced the same 23-commit set.
- The repository is not shallow. `git ls-remote --heads --tags origin` advertised only `main`; its tip was present in the scanned history. Deleted/unadvertised refs, provider caches, release assets, GitHub Actions logs, external forks and unreachable/reflog-only objects were not audited.
- Reproductions used a separate source export under `/tmp/just-cards-security/source`, temporary SQLite data, and local Chromium. No production requests or load tests were performed; no local credential files or real game data were copied.
- Existing owner-auth, room-socket, room-admission, room-recovery-api and managed-room tests: **14 passed across five files**.
- No application fixes, dependency updates, deployment changes, credential rotation or history rewrites were made. Full build/type checks were not run for this report-only change.

## Findings

### 1. High — public ruleset source URLs allow stored script execution

Evidence: `src/routes/api/rulesets/+server.ts:24`, `src/lib/rulesets/service.ts:206`, `src/lib/components/family-lobby.svelte:167`.

Anonymous `POST /api/rulesets` accepts a valid bundle with an arbitrary `sourceUrl`. The service stores the URL without validating its protocol. The lobby renders it directly as the “Read source rules” link; `/play/{rulesetId}` exposes the same component for an individual saved game. The owner hook does not protect this creation route.

**Confirmed locally:** copied a built-in playable bundle, supplied a `javascript:` URL that only sets a harmless DOM marker, received HTTP 200, opened the saved game, and clicked the source link. Chromium executed the marker in the app's origin. This requires a victim to click the link, not merely load the page.

Impact: attacker-controlled script can read localStorage seat/recovery information and issue same-origin requests. An HttpOnly owner cookie prevents reading the cookie itself, but does not prevent script from issuing authorized owner requests, including paid AI imports and shared-library changes.

Fix: parse and allowlist `http:`/`https:` source URLs at the shared persistence boundary; validate types and lengths; render legacy unsafe URLs as plain text. Apply the same policy to all source-link components. Add a compatible nonce/hash-based CSP as defense in depth. Tests must cover anonymous creation, stored legacy values, mixed-case/control-character protocols and actual browser clicks.

### 2. High — tiny public scoring requests trigger exponential work

Evidence: `src/routes/api/sessions/[sessionId]/+server.ts:8`, `src/lib/scorekeeper/engine.ts:687`, `src/lib/gameplay/pattern-detector.ts:413` and `:681`, `src/lib/session/session-store.ts:184` and `:198`.

Score events accept caller-supplied pattern packs and card arrays. An `all_same_rank` pattern without `maxCards` enumerates every nonempty subset of matching cards. `maxMatches` is applied only **after** candidate generation and sorting, so setting it to one does not bound the work. Nested pattern composition provides additional amplification opportunities.

**Confirmed locally:** anonymous session creation followed by an accepted `add_pattern_round`, using repeated aces, `minCards: 1` and `maxMatches: 1`:

| Cards | Request bytes | Candidates implied by enumeration | POST result | Local elapsed time |
| --- | ---: | ---: | --- | ---: |
| 8 | 454 | 255 | 200 | 8 ms |
| 12 | 506 | 4,095 | 200 | 25 ms |
| 16 | 558 | 65,535 | 200 | 378 ms |

Times are local observations, not Cloudflare benchmarks. Larger harmful inputs were not executed. The algorithm would attempt over a billion subsets for 30 matching cards. Successfully persisted events are replayed on later reads and appends, making expensive histories reusable.

Fix: enforce server-owned limits on cards, pattern depth/count, candidate exploration and total work. Stop enumeration before allocation exceeds the budget; limit composition too. Client-provided match options cannot override those limits. Bound history size and use validated replay checkpoints where appropriate. A body-size cap alone does not fix this sub-kilobyte attack.

### 3. High — anonymous durable writes and full-catalog reads permit storage/cost abuse

Evidence: `src/routes/api/sessions/+server.ts:5`, `src/lib/server/score-dispatch.ts:12`, `src/routes/api/rulesets/+server.ts:24`, `src/lib/rulesets/d1-store.ts:101`, `src/routes/play/+page.server.ts:3`, `src/routes/+page.server.ts:8`.

The 20-active-room cap and five-creations-per-hour limit cover shared tables, not physical score sessions or ruleset creation. Public users can create arbitrarily many durable score sessions and global catalog entries. House-rule/review-copy endpoints also persist new records. There are no application-wide creation/storage budgets or record-retention policies on these paths. Session event logs grow indefinitely and are rewritten/replayed in full.

**Confirmed locally:** seven consecutive anonymous session creations from one client all returned HTTP 200; anonymous ruleset creation also succeeded. Deployment impact follows from the production dispatch to Durable Object SQLite and the D1 adapter, rather than a production stress test.

The public catalog query selects every row including every full bundle, without pagination. Both main page loaders use that listing. Flooding the catalog therefore increases D1 read work, JSON parsing and page payloads for legitimate visitors, while also publishing spam to their game picker.

Fix: give public writes explicit quotas, validation and retention; consider owner-only global catalog publication with private/temporary public variants. Apply admission before persistence, cap sessions/events/record sizes, and introduce paginated metadata-only catalog reads with individual bundle fetches. Add an operator kill switch for public writes and usage alerts.

### 4. High — arbitrary IDs instantiate storage-backed Durable Objects before rejection

Evidence: `src/lib/server/room-dispatch.ts:21`, `src/lib/server/score-dispatch.ts:10`, `src/lib/server/worker-sockets.ts:12`, `src/lib/server/card-room.ts:25`.

Any syntactically valid room code is dispatched through `ROOMS.getByName(code)` before room existence or seat authorization is checked. Score requests similarly route arbitrary IDs to `score-{id}` objects. The CardRoom constructor creates three SQLite tables before the handler can return “not found” or “missing credential.” WebSocket requests also route before checking membership in an existing room.

Consequently an attacker can invoke fresh object IDs even without successfully creating a room. Failed room creation also reaches a fresh room object before global admission rejects it. Active-room counts do not bound this object-initialization/storage work.

This is a code-path finding; exact Cloudflare billing/minimum storage consequences were not measured. Fix: validate credentials/body syntax before dispatch, reject unknown IDs via a bounded registry or signed routing capability, and defer storage initialization until admission. Add edge rate limits covering reads, misses and upgrade attempts as well as successful writes.

### 5. Medium — request-body limits are absent or applied after buffering

Evidence: ruleset/session POST handlers call `request.json()` without a size limit; `src/lib/server/room-dispatch.ts:28` buffers the room request before the 16,000-character check in `room-api.ts`; `/api/owner/session` checks its 1,024-character limit after `request.text()`.

Large requests consume memory and parsing work before rejection. Room creation additionally parses a cloned body before dispatch. TypeScript casts provide no runtime shape validation; arbitrary config/metadata fields can be retained in persistent records.

Fix: use a common streaming byte-limited reader before parsing or RPC forwarding. Treat Content-Length as an early hint, not the sole enforcement. Apply strict runtime schemas, field/array/depth limits and a consistent 413 response. Test chunked bodies and oversized metadata as well as normal JSON.

### 6. Medium — vulnerable dependency versions remain in the lockfile

`npm audit --json` reported **38 affected dependency entries: 3 critical, 25 high, 5 moderate and 5 low**. These counts include transitive propagation and are not 38 confirmed exploitable application vulnerabilities.

Locked versions include SvelteKit 2.52.0, Svelte 5.51.2, Vite 7.3.1, Vitest 4.0.18, devalue 5.6.2 and MCP SDK 1.26.0. The SvelteKit content-negotiation advisory is relevant to public request handling: [maintainer advisory GHSA-29g2-3rmr-qm68](https://github.com/sveltejs/kit/security/advisories/GHSA-29g2-3rmr-qm68) describes CPU exhaustion via crafted Accept headers and identifies 2.70.2 as the patch for that specific issue. Platform header limits mitigate its impact; no production exploit was attempted.

The Vitest critical advisory requires an exposed UI server; it is not evidence of critical production Worker compromise. Vite/Miniflare/Wrangler findings primarily concern development tooling. Remote-function and adapter-node findings need different reachability analysis because this app does not enable those experimental APIs and deploys with adapter-cloudflare. MCP routes are owner-gated. SvelteKit/Svelte still ship application runtime code despite their placement in devDependencies.

Fix: update compatible dependency groups, inspect each remaining advisory's affected path, rerun the full tests/check/build and repeat audit. Do not use an unreviewed `npm audit fix --force`. Keep dev/test servers private. Local full results: `/tmp/just-cards-npm-audit.json`.

## Additional hardening and privacy observations

- **Source fetching:** URL import restricts schemes to HTTP(S), but does not reject private/loopback destinations or revalidate redirect targets (`generator.ts:1266`). Owner gating prevents anonymous access today. For local/self-hosted deployments, an owner importing an attacker-supplied URL can reach services on the host's network. Add destination/redirect policy; do not assume Worker networking protections apply to Vite. The existing 15-second timeout and 2 MB streamed response limit are useful controls.
- **Owner AI cost:** model calls have per-call timeout/token limits and bounded repair attempts, but no aggregate spend/concurrency budget. Owner gating is valuable; add a daily request/token budget and concurrency ceiling, particularly because finding 1 can act through an owner browser.
- **Capability privacy:** score-session IDs function as both read and write capabilities. Anyone who obtains an ID can read player data and append events; there is no separate authorization token. Default API IDs use UUIDs, but callers can choose weak IDs. Avoid treating them as public identifiers; consider separate credentials, enforce entropy and keep them out of logs. Shared room codes are only 32 bits and permit outsiders with a self-generated token to see the roster and join available seats. This is the documented invitation model, but needs lookup/join rate limits before broad exposure.
- **Logging:** the structured logger redacts sensitive key names, but a secret embedded in a `sourceUrl` query or an error message is still a string. Generation logs source URLs. Strip userinfo/query strings where not needed and review deployed observability retention/sampling. Do not infer that key-name redaction makes all logs secret-free.
- **Domain launch:** inspect actual deployed WAF/rate-limit rules, Worker CPU limits, alerting, provider budgets, security headers and all alternate hostnames. The repository does not establish whether dashboard-side controls exist. Ensure any custom-domain protection also covers or disables alternate workers.dev/preview access. Request limits and CPU limits address different cost dimensions; neither is a total storage/spend cap. See [Cloudflare pricing and cost controls](https://developers.cloudflare.com/workers/platform/pricing/).

## Git/publication assessment

No credential rotation or history rewrite is justified solely by the scanner results. If a real credential is later identified, rotate/revoke it before considering history cleanup.

The historical path check found `.env.example` and `.dev.vars.example`, not committed live `.env`, `.dev.vars`, `.local` databases or `.wrangler` state. Ignore rules currently exclude those local sensitive paths. Publish a reviewed checkout, not an archive of the whole working directory.

Author/committer identity is present in Git metadata (two distinct author/committer pairs). Older documentation also contains personal absolute checkout paths, including historical AGENTS.md, architecture docs and specifications; deleting them from current files does not erase history. Third-party HTML fixtures contain publisher content and public identifiers; they need a redistribution/attribution review, not automatic classification as stolen application credentials. Confirm the personal identity and project context you intend to make public. A clean secret scan does not assess fixture licensing.

Before publication, repeat the scan on the exact final refs and source export, enable repository secret scanning/push protection where available, and add dependency/secret scanning to CI plus a security-reporting policy. Preserve the existing owner authorization, hashed seat credentials, single-use seat recovery, viewer-specific projections, parameterized SQL, same-origin WebSocket checks and hibernating ping/pong behavior during remediation.

## Suggested remediation order

1. Block unsafe source-link protocols, including already stored records; add browser regression tests.
2. Bound scoring work before candidate enumeration and history replay.
3. Put quotas/admission in front of every durable write and unknown-object dispatch; paginate the catalog.
4. Add bounded request parsing and runtime schemas.
5. Upgrade and triage dependencies, then run full tests, `npm run check`, `npm run build` and the history/source scans again.
6. Verify live domain/edge controls, budgets, retention and privacy choices before advertising the deployment.

## Follow-up audit after runtime scoring budget — 2026-10-30

This section reviews the current uncommitted working tree after the admission and
runtime pattern-budget fixes. The numbered findings above describe the original,
pre-fix audit. This pass identified three additional medium-severity issues;
no new high/critical issue was confirmed in the paths reviewed. Findings A and B
are directly anonymous. Finding C requires the owner to render untrusted content
in an MCP widget; it is not an owner-authentication bypass.

### A. Medium — public debug traces amplify small score histories into large responses

Evidence: `src/lib/session/session-store.ts:202`,
`src/lib/scorekeeper/engine.ts:631-653`, `src/lib/server/score-api.ts:40`.

Anonymous session creation accepts `config.trace: true` and a caller-defined
scoreRulePack. Ordinary `add_round` events emit the complete list of matching
modifier IDs for every card when the session is read. Modifier ID lengths and
trace output size have no dedicated bounds. The new pattern-work budget does not
charge this ordinary card-value/trace path. The 256 KB stored-history cap does not
bound its derived response.

Confirmed using the real score API handler with an isolated in-memory repository:
13,836-byte configuration, 40 matching modifiers with long IDs, and 100 ace cards
per 1,422-byte event. Creation and every append returned 200.

| Events | Stored session bytes | JSON response bytes |
| --- | ---: | ---: |
| 1 | 16,845 | 1,057,488 |
| 2 | 19,733 | 2,100,908 |
| 3 | 22,621 | 3,144,328 |

A subsequent GET regenerates the same trace. No large-history exhaustion test or
production request was made. Larger response growth follows from the loop, but
actual Worker memory failures and dollar costs were not measured. Impact is
repeatable CPU, memory and response amplification, not secret disclosure.

Fix: disable detailed traces on anonymous session views, or impose an explicit
trace-entry/byte budget with a truncation marker. Bound modifier IDs/counts and
card entries; include ordinary card-value evaluation in execution budgets where
appropriate. Validate any rejecting view constraints before saving, since current
append validation derives state with tracing disabled. Truncating debug detail
must never silently truncate score totals.

### B. Medium — database-backed pages bypass the API request limiter

Evidence: `src/hooks.server.ts:30`, `src/routes/+page.server.ts:5-9`,
`src/routes/play/+page.server.ts:3`,
`src/routes/play/[rulesetId]/+page.server.ts:15-16`.

The hook calls API_RATE_LIMIT only for routes beginning `/api/`. Public page
loaders at `/`, `/play`, and `/play/{rulesetId}` also read the catalog/D1. Their
SvelteKit data requests use those page route IDs, so they miss the same guard.
An anonymous client can avoid the application limiter by requesting page data
instead of `/api/rulesets`, incurring database/rendering work repeatedly. Catalog
pagination limits individual results, but does not limit request frequency.

Confirmed against the actual hook and page loaders bundled with production
`dev=false` and isolated fake bindings. With the limiter configured to deny every
call, `/api/rulesets` returned 429 and made no query; `/`, `/play`, and a `/play`
loader invocation for `/play/__data.json` each returned 200, called D1 once, and
never invoked the limiter. This is a handler-level reproduction, not evidence
about live WAF or CDN settings.

Fix: apply read admission before all database-backed page loaders, including data
requests and individual ruleset loads, while leaving static assets unaffected.
Cache public catalog data where suitable. Test denied HTML and data requests for
zero database calls. Verify any external WAF policy covers these paths too.

### C. Medium — MCP widget HTML interprets untrusted names as markup

Evidence: `src/lib/mcp/server.ts:465-481`, `:586-591`, `:1249-1255`.

The MCP leaderboard concatenates player IDs into `innerHTML`; the play widget
similarly concatenates ruleset names, labels, IDs and status strings. A public
score session can contain an HTML-bearing player ID. If the signed-in owner asks
an MCP client to render that session, render_score_leaderboard carries the ID into
the widget template without escaping.

Confirmed locally: the real score API handler accepted a player ID containing an
image with a harmless onerror marker. The actual leaderboard template, extracted
from the TypeScript syntax tree and rendered in headless Chromium, executed the
marker and invoked a stubbed `window.openai.callTool('audit_marker', {})` once.
All browser network requests were blocked; no real tool or account was called.
Node Playwright was used because neither available Python environment included
Playwright.

Owner authentication still protects MCP endpoints. The injection runs in the
widget document, not demonstrably in the main site's origin. A real client's
sandbox/CSP/tool permissions may further restrict it; no actual ChatGPT host or
privileged tool execution was tested. Nonetheless, owner authentication does not
make public player names or imported rule text safe to interpret as HTML.

Fix: construct dynamic DOM nodes with textContent and set attributes through DOM
APIs, or consistently escape text and attribute contexts throughout both widget
templates. Add browser regressions for player names, ruleset/zone labels and
status/error strings. Do not rely solely on a consuming client's sandbox.

### Previously known owner-only issue

The MCP JSON-RPC batch/AI budget mismatch remains: one HTTP request consumes one
admission unit although it can contain several generation tool calls. This is
owner-only and was already reported; it is not counted among the new findings.
Source-fetch destination policy, retention and live dashboard verification also
remain the documented follow-up work.

### Verification and scope limits

- Full regression suite: **406 tests passed across 76 files**, including all 11
  new pattern-budget regressions. The reported nested-pattern case remains fixed.
- Fresh npm audit: **9 low, 0 moderate, 0 high, 0 critical** dependency entries.
- Gitleaks 8.30.1 with full redaction: **zero findings** in all **23 reachable
  commits** (`--all`, repository is not shallow), and **zero findings** in a fresh
  source-only export of **378 tracked/untracked non-ignored files**.
- No production requests, deployments, paid AI calls, credential rotation,
  history rewriting or application changes were made. This report was updated.
- Credential scans do not cover hidden remote refs, external forks, provider
  logs, release assets or ignored local secrets. Existing publication/privacy
  limitations from the initial audit still apply.
- Local scanner outputs: `/tmp/jc-fourth-history.json`,
  `/tmp/jc-fourth-source.json`, `/tmp/jc-fourth-audit.json`.

### Follow-up implementation status: public reads

Findings A and B above are now fixed in the working tree. Public session replay
and views disable debug traces, including legacy and pattern-level flags. The
three-event fixture now returns 22,723 bytes instead of 3,144,328 bytes, preserving
its stored history and total. Database-backed page HTML/HEAD/data requests share
the API limiter and stop before loader/database work when denied.

The fixes passed 17 new regression tests, 423 total tests, type checks
and production build. See [implementation spec](./specs/2026-10-30-public-read-hardening.md).
Finding C (MCP widget HTML) was explicitly deferred by the user and remains
unchanged. No deployment was performed.

## Additional scan after public read hardening

The public trace suppression and page-admission fixes remain effective in their
regression tests. This pass reviewed score validation/output paths, room and seat
authorization, authoritative card/tile command handling, private state projections,
resource admission, caching, owner protection, dependencies and reachable Git
history. One additional medium-severity issue was confirmed. No new high/critical
issue was confirmed within this scope.

### D. Medium — repeated validation messages amplify public score responses

Evidence: `src/lib/scorekeeper/engine.ts:700-708`,
`src/lib/session/session-store.ts:194-198`, `src/lib/server/score-api.ts:37`.

The trace fix does not bound `state.validationIssues`. Pattern scoring adds a
separate error message for every detected match whose pattern has no scoring
mapping, embedding the full caller-controlled pattern ID in each message. There
is no pattern-ID length limit or diagnostic byte limit. Session append validates
finite totals but does not reject these semantic validation failures, so the event
is persisted and later reads regenerate the same messages. This endpoint is public
and does not require owner authentication.

Confirmed through the actual score API handler in an isolated repository:

- 8,631-byte append input: eight ace cards, a roughly 8 KB pattern ID, one
  all_same_rank pattern, and an empty patternScoring array.
- The append returned 200 and persisted the event. Its response contained 255
  repeated validation messages and was 2,081,274 bytes, with no trace field.
- In a second fixture explicitly using `config.trace: false`, two such events
  occupied 34,749 stored bytes and produced a 4,162,297-byte response containing
  510 validation messages. A subsequent GET regenerated the same response.
- Enumeration stayed within the existing runtime work budget. That budget counts
  computation steps; it does not bound bytes copied into diagnostic messages.

Impact: repeatable CPU/memory/response amplification using a small public session,
not credential disclosure. No production load test, Worker memory exhaustion or
monetary cost was measured. The previous trace fix addressed trace output but
missed this separate validation-output path.

Fix the validation boundary comprehensively: reject invalid pattern/scoring
mappings before enumeration and persistence; bound identifiers, diagnostic count
and diagnostic message length; deduplicate errors per rule instead of per match.
Legacy stored events also need bounded diagnostics on replay. Merely clipping the
serialized response after constructing the full messages would still incur the
allocation cost. Return a compact error rather than silently scoring invalid rules.

### Scan checks and remaining scope

- Fresh Gitleaks 8.30.1 scans: zero findings across 23 reachable commits/all local
  refs and a source-only export of 381 tracked/untracked non-ignored files.
- Fresh dependency audit: 9 low entries; zero moderate, high or critical entries.
- The first full regression run passed 422 tests and caught one documentation
  style failure caused by an audit-report line added after the previous test run.
  That report-only formatting error was corrected; the final run passed all
  423 tests across 78 files.
- The user-deferred MCP widget issue and previously reported owner-only MCP batch
  budget mismatch remain unchanged; they are not new findings in this scan.
- No application changes, deployments, production requests or paid AI calls.
  This report was updated. Live WAF/provider budgets and hidden/external Git
  artifacts remain outside the scan's verified scope.
- Local results: `/tmp/jc-fifth-history.json`, `/tmp/jc-fifth-source.json`,
  `/tmp/jc-fifth-audit.json`, `/tmp/jc-fifth-tests.log`.

## Validation fix and follow-up scan

Finding D is fixed in the working tree. Pattern and scoring-map identifiers are
limited to 96 characters; mappings are limited to 32 unique entries with finite
numeric points. Missing mappings and invalid patterns fail before enumeration.
Public session creation, append and replay use strict validation, so invalid
events are rejected before persistence. Invalid legacy histories remain stored
and return compact errors; undo can recover an invalid event.

Both score and pattern validation collect deduplicated diagnostics with at most
32 entries and bounded fields, including an explicit overflow marker. These
limits apply during collection, avoiding allocation of repeated large messages.
The reported long-ID payload now returns a 59-byte HTTP 400 response instead of
a roughly 2.08 MB success response, and the event is not saved. Valid zero-point
mappings and ordinary scores remain supported. See the
[implementation spec](./specs/2026-10-30-score-validation-limits.md).

The subsequent scan reviewed the changed validation collectors, public session
boundary, owner guards, rendering and error paths, and regression coverage for
admission, trace suppression and room/private-state authorization. No additional
confirmed security finding emerged within this scope. This does not establish
that the application has no remaining vulnerabilities.

- All 15 new regressions pass, and the full suite passes **438 tests across
  79 files**. Type checks report zero errors/warnings; the production build and
  diff whitespace check pass.
- A separate 20-case malformed-input probe rejected every event before saving,
  with errors at most 59 bytes. An invalid legacy long-ID event returned a
  59-byte error while preserving its history.
- Fresh redacted Gitleaks scans found **zero findings** across all **23 reachable
  commits** and a source-only export of **384 tracked/untracked non-ignored
  files**.
- Fresh dependency audit: **9 low, 0 moderate, 0 high, 0 critical** entries.
- The user-deferred MCP widget issue and previously reported owner-only MCP batch
  budget mismatch remain unchanged. Retention, source-fetch policy and live
  provider/WAF configuration remain documented follow-up work.
- No deployment, production requests, paid AI calls, history rewriting or
  credential rotation were performed. Hidden refs, external forks, release
  artifacts, provider logs and ignored local secrets remain outside this scan.
- Local scanner results: `/tmp/jc-sixth-history.json`,
  `/tmp/jc-sixth-source.json`, `/tmp/jc-sixth-audit.json`.

## Functional walkthrough and deployment

Deployed version `61f974cb-6849-42be-bd7d-843e1091c970` to
https://just-cards.otoolecf.workers.dev after a successful deployment dry run.
The private production config now includes the API limiter, 1,000 ms CPU limit,
10% log sampling and enabled public writes. Remote D1 reported no pending migrations.

Eight live browser checks passed: both mobile branding screens, both accessible
source footers, both About disclosures, offline score creation/undo/redo/reload
and resynchronization, and a complete two-phone Rummy round with reconnection.
The latter checked 91 private socket views and exercised seven melds, eight
layoffs and four discard pickups. Local built-Worker checks also passed offline
sync, Rummy and Golf round play. Guided scoring was manually exercised after
selecting its tab and returned expected totals. Score/lobby styling was visually
inspected locally and on the deployed score screen; this was not a pixel-baseline
comparison. No application UX changes were made during this walkthrough.

The older broad browser suite is not wholly green: its local runs encountered
shared creation quotas, duplicate persisted catalog fixtures, assumptions about
anonymous owner actions, missing selection of the Guided cards tab, timing and
outdated text expectations. These results must not be described as a full E2E
suite pass. Owner-only management and invalid-input rejection remain intentional
behavior changes from security hardening. Paid AI import was not exercised.

A pre-registry session found in the existing browser initially could not sync.
Its known ID was registered through the owner endpoint, then reload confirmed
Saved and synced with both 12-point totals and two events preserved. Other legacy
IDs absent from the registry can require the same owner registration; this rollout
does not establish that every old room/session on every device is registered.
Local test logs: `/tmp/jc-live-walkthrough.log`, `/tmp/jc-worker-tests.log`,
`/tmp/jc-worker-family.log`, `/tmp/jc-walkthrough-adjusted.log`.

### Browser-suite follow-up

The stale-test caveat above is resolved for the default local browser suite.
Two consecutive fresh-data runs each passed 38 tests with zero failures. Four
existing Worker-specific scenarios remain explicitly skipped in Vite; they are
not counted as passes. Owner scenarios now authenticate all relevant contexts,
guided entry selects its tab, and the harness isolates databases/credentials and
allows the actual HTTP polling interval. Application behavior is unchanged.
See [browser test spec](./specs/2026-10-30-browser-test-isolation.md).
