# Public documentation

## Intent

Make documentation useful to readers and contributors without authoring metadata,
work logs, or reports about the process used to write it.

## Scope

Remove draft labels, author/date/status fields, dated section headings and one-off
execution reports throughout the Markdown documentation. Keep setup requirements,
architecture contracts, test instructions, acceptance criteria, source provenance,
and actionable limitations. Preserve filenames and links to existing specifications.

## Acceptance criteria

- Guides lead with instructions and behavior rather than authoring history.
- Specifications describe intent, contracts and test coverage without completed-run logs.
- Publication guidance explains repeatable checks and outstanding risks.
- Existing documentation links and commands remain usable.

## Test plan

Add a Markdown-wide guard for authoring metadata and dated headings, run it before
cleanup, then rerun it with the existing documentation tests. Run check and build.

## Rollback

Revert the prose edits and documentation guard; application behavior is unchanged.
