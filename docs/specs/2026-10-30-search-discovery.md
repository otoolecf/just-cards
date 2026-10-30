# TDD Spec: Search discovery

## Intent
Help people recognize Just Cards in search results and shared links with clear,
accurate descriptions of physical-card scoring and virtual tables.

## In Scope
Distinct Score/Play titles, descriptions and visible introductory copy; canonical
URLs on https://justcards.app; Open Graph and Twitter metadata using the existing
app icon; a sitemap with public rulesets; owner noindex and retained room noindex.
Self-hosters can override PUBLIC_APP_URL. Configure the production custom domain.

## Out of Scope
Search Console account setup, ranking guarantees, generated marketing pages.

## Expected Outcomes
1. Server HTML describes each public page and strips query strings from canonicals.
2. Draft rulesets remain indexable; owner and rooms remain outside the sitemap.
3. Shared links use the correct page title, description, public URL and app icon.

## Acceptance Criteria
- Score/Play have distinct descriptive titles and copy.
- Owner has noindex; draft previews have no noindex directive.
- robots.txt advertises the sitemap, whose public URLs include stored rulesets.
- Local checks, build and rendered HTML regression tests pass.

## Data and Rules
Use RulesetStore through the existing service. Sitemap URLs must be XML escaped;
never include room codes, credentials or query parameters in metadata.

## Test Plan (Red -> Green)
Browser tests inspect initial HTML for titles, descriptions, canonical and social
metadata, and check owner/room exclusion and ruleset inclusion in the sitemap.
Verify query stripping and metadata updates after navigation.

## Implementation Notes
Shared SiteMetadata component; PUBLIC_APP_URL with production fallback; sitemap
endpoint; existing layout icons and typography remain in use.

## Required checks
npm run check; npm run build; focused Playwright tests.

## Rollback Plan
Revert metadata, sitemap and copy changes; restore the prior custom-domain config.
