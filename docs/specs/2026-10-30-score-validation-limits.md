# TDD Spec: Bounded score validation

## Intent

Public score events must not turn long pattern identifiers into repeated large
diagnostics. Validate scoring mappings before enumeration, reject invalid data
before saving, and keep diagnostics bounded during legacy replay as well.

## In Scope

- Pattern IDs and scoring-map IDs: nonempty strings, at most 96 characters.
- Scoring mappings: at most 32 entries, unique IDs and finite numeric points;
  every declared pattern must have a mapping before any card enumeration.
- Reject duplicate pattern IDs and invalid pattern definitions.
- Diagnostics: deduplicate as collected, at most 32 items, 256 characters per
  message, 64 per code, 96 per rule ID, with an explicit overflow marker.
- Public session creation, append and read reject validation failures with compact
  errors. Legacy invalid histories remain stored; undo can recover invalid events.
- Repeat source/history/dependency and public-boundary scans after the fix.

## Out of Scope

- Deferred MCP widget work, AI batching, deployment, and history migrations.

## Expected Outcomes and Acceptance Criteria

- [x] The reported 8.6 KB event returns a small 400 response without persistence.
- [x] Missing mappings fail before candidate generation, even for expensive cards.
- [x] Invalid/duplicate IDs, duplicate mappings and nonfinite points are rejected.
- [x] Repeated diagnostics across entries/events stay deduplicated and bounded.
- [x] Legacy malformed records return compact errors; undo/redo respects validation.
- [x] Normal scores and valid zero-point mappings remain unchanged.

## Data and Rules

Public callers cannot relax validation with event options. Bounded diagnostics
must be collected during evaluation, not clipped after a huge response has already
been constructed. A validation error must never silently produce accepted partial
scores. Permissive direct engine callers still receive bounded issue lists.

## Test Plan (Red -> Green)

Reproduce amplification through the real score API with an isolated repository.
Check append atomicity, pre-enumeration rejection, malformed mapping variants,
identifier boundaries, diagnostics aggregation, invalid creation, legacy replay
and undo/redo. Run existing engine/session regressions and full checks/build.

## Implementation Notes

Share a small bounded diagnostic collector between score and pattern validation.
Validate mappings at the pattern scorer boundary and enable strict validation in
public session replay. Keep all limits server-owned and all histories intact.

## Required checks

`npm test`, `npm run check`, `npm run build`, `git diff --check`, dependency audit,
and redacted Gitleaks source/all-ref scans.

The initial regression run failed 12 tests and passed 3. All 15 new tests now
pass; the full suite passes 438 tests across 79 files. Type checks report no
errors or warnings, and the production build and diff whitespace check pass.
An additional 20-case malformed-input probe rejected every event before saving,
with a maximum error response of 59 bytes. Legacy replay also returns a compact
error while preserving history. Source/history scans found no credentials and
the dependency audit reported 9 low entries, with none moderate or higher.

## Rollback Plan

Preserve stored histories and the rejection boundary. Simplify invalid rules or
undo an invalid legacy event rather than disabling limits for public requests.
