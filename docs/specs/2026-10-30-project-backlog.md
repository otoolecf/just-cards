# Project backlog

## Intent

Keep outstanding work in one discoverable, prioritized list. Include photo-assisted
scoring to reduce the effort of entering physical cards during a game.

## Scope and expected outcomes

Create a root TODO.md, link it from the README and docs index, and point existing
roadmaps to it. Include only outstanding work or clearly labelled ideas. Keep
implemented scoring, rooms, offline score entry and MCP scaffolding out of the backlog.
Photo scoring remains a future feature: recognize cards, allow review/correction,
and apply the selected game's rules through the existing score event model.

## Acceptance criteria and test plan

Add TODO.md to the documentation link/command checks and observe failure before
creating it. Verify all local links afterward, and run build and type checking.

## Rollback

Revert the backlog and navigation edits. Application behavior is unchanged.
