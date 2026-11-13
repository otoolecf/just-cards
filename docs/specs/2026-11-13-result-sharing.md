# TDD Spec: Share finished scores as an image or plain text

## Intent

Finished physical scoring and virtual games should offer a shareable result,
without hosting result pages, uploading images or exposing room access. Use the
approved scorecard: a centered winner, standings, numeric scores by hand, hand
result colors and the public homepage. Plain text places the winner on line three.

## In Scope

- A reusable Share results control on naturally completed score sheets and games,
  and on host-ended games with completed scores. All participants/viewers can share.
- Manual Finish & share for score sheets without a detectable endpoint; this
  exports current scores without ending, pausing or mutating the shared session.
- Completion from copied rounds/target policies, Bridge/Mahjong progress and
  single-deal outcome capabilities, not game IDs. Legacy catalog fallback is exact-ID.
- Freeze an allowlisted result at button press. Never include cards, room/session
  IDs, invite links, credentials, events or source payloads in exports.
- Accurate totals, low/high wins, ties, solo success/loss, partnerships, past seats,
  four or more players, zero/negative/fractional scores and absent hand entries.
- Personal scoring replays active events with the existing scorers, respecting
  undo/redo; gameplay reads the authoritative public scores and totals.
- Locally render PNG from semantic design tokens, with a prominent centered winner
  and per-hand numbers. Colors use best / middle / last for any roster size.
- Plain text contains numeric hand scores and totals, no emoji/color markers.
- Native file sharing when supported; always provide image download. Copy plain
  text with a selectable preview fallback. Cancellation does not download or error.
- Name inclusion toggle, frozen preview, no extra API requests for sharing and
  mobile/keyboard-accessible controls. Browser object URLs are cleaned up.
- Stage and capture evidence before considering production release.

## Out of Scope

- Hosted result storage, public live-room links, server rendering, dependencies,
  automated social posting, accounts, and changing authoritative game lifecycle.

## Expected Outcomes / Acceptance Criteria

- [x] Completion reveals sharing; undo of final scores removes automatic completion.
- [x] Scorekeeper and gameplay produce matching, privacy-safe result snapshots.
- [x] Image and numeric text show the winner/ties and the same totals/hand values.
- [x] Both formats work for more than three players and manual endings.
- [x] Unsupported sharing/clipboard, cancellation and rendering failure have usable fallbacks.
- [x] Mobile browser checks prove both entry points and no sharing network writes.

## Data and Rules

Scores remain event-derived and server authoritative. Share models contain only
names, public numeric scores, game display name, outcome and winning direction.
Bridge partners are grouped by the declared capability; Solitaire loss must not
declare the only player a winner. Extra bonuses/adjustments remain reflected in
totals and are identified when they differ from hand sums. Image exports show the
most recent 36 hands with an explicit range for longer games; text retains all
hands. Bound canvas pixel count and fall back to text when too large.

## Test Plan (Red -> Green)

- Unit: numeric formatting, line-three winner, ties, low/high wins, 4+ players,
  zero/negative/missing values, privacy allowlist, partnership grouping, completion,
  ordinary and stateful scoring replay, undo/redo, new branches and token layout.
- Unit: file-share capability detection, cancellation vs errors and no network use.
- Browser: finish Golf scoring with four names, preview and download real PNG,
  copy numeric text, name toggle, cancellation, unsupported APIs, no network writes;
  finish/concede a virtual game and end a table after a completed round.
- Full unit suite, `npm run check`, `npm run build`, focused browser regressions.

## Implementation Notes

Use pure share-model/formatting helpers, a browser-only Canvas renderer and a
shared Svelte component. Copy optional target-score metadata into GuidedScoreProfile.
No schema migration or new Cloudflare resource is required.

## Verification

- Red tests preceded the public model, completion policy and browser share helpers;
  the finish-rule regression also failed before its implementation.
- 602 unit tests passed across 88 files; `npm run check` and `npm run build` passed.
- Five local browser checks passed: result sharing, round progress and room ending.
- All three result-sharing scenarios passed on the isolated feature preview:
  `https://just-cards-share-results-preview.otoolecf.workers.dev`.
- Saved evidence under ignored `.output/result-sharing-evidence/`: the actual PNG
  download, scoring image/text controls, gameplay text controls and test reports.
- Native share and clipboard callbacks are stubbed in browser tests; PNG rendering
  and downloads run in the deployed browser. No real social message was sent.
- No production deployment or persistence migration was performed for this feature.

## Rollback Plan

Revert this commit or redeploy staging's previous version. Existing sessions and
events do not change and require no data rollback.
