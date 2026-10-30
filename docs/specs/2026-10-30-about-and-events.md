# About panel and collapsible score events

## Intent

Make the project description easier to scan and keep detailed score history out
of the way until a player wants it.

## Scope and expected outcomes

- Keep About initially collapsed, with a bordered surface, clear toggle and three
  readable paragraphs separating purpose, usage and AI disclosure.
- Wrap Recent events in a native disclosure, collapsed by default with its count
  visible. Keep the existing event data and newest-first ordering.
- Preserve keyboard operation, focus treatment and 44px summary targets.
- Use existing semantic tokens and avoid horizontal overflow on phones.

## Acceptance criteria and test plan

Add browser checks for About paragraph structure and keyboard toggling. Create a
score session, confirm events start hidden, expand/collapse with the keyboard,
add a score while collapsed and confirm the count updates without opening history.
Reload and confirm history remains collapsed. Run the checks before implementation,
then repeat with existing footer, scoring and design primitive tests, build and check.

## Rollback

Restore the earlier About markup and always-visible event section. No event-log
or persistence changes are needed.
