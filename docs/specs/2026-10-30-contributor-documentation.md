# TDD Spec: Contributor documentation

## Intent
Keep the current documentation focused on running, understanding and contributing
to Just Cards. Completed release reports and small presentation/setup task notes
can remain in Git history without appearing in the current contributor tree.

## In Scope
Remove launch checklist/results and the historical security work log. Consolidate
architecture and MCP integration descriptions around implemented boundaries. Prune
completed cosmetic/setup specs, update the backlog and repair references.

## Out of Scope
Application changes, dependency upgrades, history rewriting and repository visibility.

## Expected Outcomes and Acceptance Criteria
- Maintained Markdown links and npm commands resolve throughout contributor docs.
- Architecture describes current SQLite/D1/Durable Object storage and shared rooms.
- MCP documentation distinguishes prototype gameplay from authoritative shared rooms.
- Current operational limitations survive removal of historical audit reports.
- Behavior/security specs, agent instructions and the TDD template remain available.

## Test Plan (Red -> Green)
Extend documentation validation to every maintained Markdown document. Add checks
that retired launch documents are absent and MCP/operations guides retain current
prototype, widget-safety and AI batch-budget limitations. Run before editing docs,
then after cleanup. Verify rendered documentation contains only current documents.

## Implementation Notes
Keep the MCP document's existing path so external links remain useful. Prefer
links to maintained contracts over repeating detailed implementation timelines.
Keep future work in TODO.md. Old specs remain available through Git history.

## Required checks
Focused documentation tests, full unit suite, docs build, npm run check and npm run build.

## Rollback Plan
Restore a removed document from its previous Git revision if a retained contract
needs detail that was not transferred to maintained documentation.
