# Card favicon and app icons

## Intent

Replace the framework favicon with the overlapping club-card mark used by the
Just Cards wordmark.

## Scope and expected outcomes

- Use a square, font-independent SVG that stays recognizable at tab-icon sizes.
- Keep the bundled favicon and static fallback consistent.
- Reuse the same bundled SVG in the on-screen wordmark, replacing the CSS illustration.
- Supply PNG icons for Apple touch and installable app launchers.
- Use the existing design palette without adding dependencies or visual tokens.

## Acceptance criteria and test plan

Check that the wordmark loads the same SVG URL as the tab icon.
Check that both SVG entry points use the Just Cards mark, icon colors come from
the design tokens, and the touch/manifest PNGs exist at their declared dimensions.
Run tests before implementation, then verify icon URLs in a browser, inspect
16px/32px rendering, and run build and type checking.

## Rollback

Restore the previous assets and icon references. No game data changes.
