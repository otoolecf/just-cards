# Just Cards wordmark

## Intent

Give the site a recognizable “Just Cards” title using a small overlapping-card
motif and typographic contrast. Keep the interface clear on phones.

## Scope

- Reuse one code-native wordmark on Score, the play lobby and the room home link.
- Use Just Cards in main browser titles; retain page/game context where useful.
- Keep the play explanation and scoring description beneath the title.
- Use existing semantic tokens, with no new assets, fonts or dependencies.

## Acceptance criteria

- Score and Play expose a readable “Just Cards” main heading and browser title.
- Decorative suits are hidden from assistive technology.
- At 320px, the title and mode navigation fit without horizontal page overflow.
- Existing form and gameplay controls remain available.

## Test plan

Add mobile browser tests for accessible headings, titles, hidden decoration and
layout bounds. Observe failure before implementation, then run the tests after
adding the shared wordmark. Run design primitive tests, build and type checking.

## Rollback

Restore the prior heading markup and home link; no stored data changes.
