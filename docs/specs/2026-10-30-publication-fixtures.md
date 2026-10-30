# TDD Spec: Publication fixture cleanup

## Intent
Remove copied publisher webpages, telemetry and contact details from the current
source tree while retaining deterministic rule extraction regression coverage.

## In Scope
Replace three saved webpages with small, original synthetic HTML rule summaries;
identify their authorship and document the distinction from live publisher pages.
Audit and record publication findings for history, identity and dependencies.

## Out of Scope
Rewriting Git history, changing identity/copyright, changing visibility, or a major
framework migration to remove low-severity dependency advisories.

## Expected Outcomes / Acceptance Criteria
- All fixture HTML is marked synthetic and contains no scripts or email addresses.
- Each fixture is under 2 KB and preserves existing golden extraction assertions.
- The fixture provenance document distinguishes original test input from publisher
  content and notes historical copies.

## Test Plan (Red -> Green)
Add a regression asserting synthetic provenance, small fixture size and absence of
scripts/contact addresses. Run it before replacements (red), then run it with the
existing golden suite after replacements (green).

## Required checks
npm test; npm run check; npm run build.

## Rollback Plan
Restore the prior fixtures only in a private checkout if extraction coverage fails.

## Authorized follow-up: commit email privacy

The user subsequently authorized replacing their personal email in author and
committer metadata with their ID-based GitHub noreply address. Preserve names,
dates, parent relationships and tree contents. Make a private bundle backup before
rewriting; verify no old email in rewritten commit metadata and identical HEAD tree,
then force-push main with an explicit lease. Set repository-local user.email for
future commits. Historical fixture removal and visibility changes remain excluded.
