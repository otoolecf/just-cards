# TDD Spec: Family card play and explicit scoring primitives

_Status: Complete_
_Date: 2026-09-17_

## 1) Intent

Make a shared round usable on separate family members' phones, with private cards,
legal turns, readable pickup piles, and automatic scoring. With physical cards,
provide fast rank entry and positional Golf scoring without requiring suits or math.

## 2) Review findings

- Play routes currently initialize client-local demo events and fixed players.
- Generated rules sum hands at round end, omitting column cancellation and net scoring.
- A generic resolve clears the draw flag after one meld; Rummy needs multiple melds
  followed by one discard. Grid replacement needs an atomic, position-preserving command.
- Hidden faces are masked in the view, while underlying card objects remain client-side.
- Source-wide HTML text includes navigation and related games; Golf's hidden layout
  sentence incorrectly makes drawn stock cards invisible to the drawing player.
- Setup is inferred from descriptive strings; there is no explicit two-player deal override.
- Score input requires a suit even when only rank matters.

## 3) Scope

- Declarative table rules: fixed grid replacement or private hand/meld play; setup,
  discard pickup, immediate-use anchor, meld validation, round ending, scoring and winner.
- One authoritative room per shared table; seat credentials, revision checks, safe
  projections, persisted commands, reconnect, and room create/join/start/next-round.
- Local SQLite room storage; Cloudflare Durable Object adapter for deployed rooms.
- Source extraction and executable policy compilation from rule semantics, with Golf
  and 500 Rum reference presets. Unknown games retain draft/preview behavior.
- Mobile room UI, opponent public cards, stock count, ordered discard pickup, totals.
- Guided score profiles use explicit policy; rank-only entry and editable grid slots.
- Persist score-session event logs and player rosters through the same local/Cloudflare
  storage boundary; restore a session after reload and retain names before the first score.

## 4) Source decisions

Reviewed 2026-09-17:
- https://bicyclecards.com/how-to-play/six-card-golf
- https://bicyclecards.com/how-to-play/500-rum

Golf: 52 cards, 2–4 players, six positions in two rows, choose two initial reveals,
draw once then replace or discard, end immediately when one layout is fully revealed,
score all layouts with same-column pair cancellation, lowest total after nine deals.
Rummy: seven cards (13 with two players), sets of 3–4 or suited runs of at least
three, ace at either end without wrapping, discard suffix pickup with immediate anchor
use, optional additional melds/layoffs then discard, empty hand ends play. Laid-off
cards retain contributor ownership for scoring. Highest score at 500 wins.
The Bicycle 500 Rum page omits numeric rank values and stock-exhaustion handling.
Keep the repository's A=15, faces=10, numeral face-value convention visibly identified
as a default. Exhausted stock ends a hand as an explicit app convention.

## 5) Acceptance criteria

- [x] Extraction isolates article rules, rejects a directory, preserves deal overrides,
  and compiles explicit rules without inferring gameplay from a game name.
- [x] A complete Golf round conserves exactly 52 unique cards and scores once.
- [x] Rummy validates sets/runs/layoffs, ownership, immediate use and turn sequencing.
- [x] Hidden ranks, suits, stock identities, credentials and private history never reach opponents.
- [x] Stale/double submissions cannot apply twice; invalid commands leave no mutation.
- [x] Separate browser contexts can create/join/play/reload; mobile has no horizontal overflow.
- [x] Physical-card scoring accepts ranks, editable grid positions, and net table/hand values.
- [x] Unit/integration tests, check, build, and browser tests pass.

## 6) Red → green test plan

Write failing extraction, policy, command/replay, projection and storage tests before
implementation. Cover complete deterministic rounds, negative totals, paired twos,
turn/identity/revision rejection, card conservation, ace boundaries and foreign layoffs.
Then verify real browser flows and the Cloudflare worker build locally.

## 7) Boundaries and rollback

No deployment, accounts, AI players, billing, or arbitrary natural-language completeness.
Keep stored runtime-bundle/v1 backward compatible through optional table policy.
Reverting this branch restores the prior demo and scoring routes; no migration of existing
ruleset data is needed. Preserve the pre-existing package-lock.json modification.

## 8) Verification and implementation evidence

- `npm test`: 229 tests across 40 files pass, including primitive contrast tests.
- `npm run check`: zero errors and warnings.
- `npm run build`: Cloudflare adapter build and Durable Object export pass.
- `npm run test:e2e`: seven Chromium tests pass. Separate 390px browser contexts
  complete a Golf round, receive automatic scores, deal again, and resume seats.
  Rummy verifies the two-player deal, private hand, stock draw and discard. Physical
  scoring verifies rank-only positional entry, standings, undo/redo and reload.
- Both actual Bicycle article responses were passed through the deterministic
  extractor/compiler and checked against the executable policies. Checked-in tests
  use concise paraphrases and minimal HTML fixtures rather than full articles.
- Local Wrangler runtime completed a full Golf round, independently checked the
  computed column scores, saved a scorekeeper event, and retained room revision,
  scores, player roster and score events across a process restart.
- `wrangler deploy --dry-run` packages the Worker with `ROOMS`. Nothing was deployed.
- Final 390px mobile rendering inspected; no horizontal page overflow.

The red/green cycle also caught concurrent opening-reveal conflicts, stale Svelte
standings/roster dependencies, unsupported suffix pickup on a fixed grid, and malformed
score events that could poison durable replay. Regression coverage accompanies each
behavioral fix; opening-reveal rebasing is exercised by the two-browser Golf flow.

This section records the initial implementation checkpoint. The completed
[family first draft](./2026-09-17-family-first-draft.md) adds D1 ruleset persistence,
hibernating WebSockets, import/resume flows and full Rummy browser coverage.
Current policy and runtime boundaries are documented in
[Shared table v1](../shared-table-v1.md). MCP gameplay retains its existing prototype.
