# Contributing

Bug reports, documentation fixes and focused pull requests are welcome. Start with
[local setup](./README.md#clone-and-run-locally); built-in games need no credentials.
The [backlog](./TODO.md) lists ideas and known follow-up work. For larger features,
open an issue first to agree on scope.

## Report a bug

Include what you expected, what happened, reproduction steps, browser/device and
the game or scoring mode. Use made-up player names and redact room codes, session
IDs and recovery links from screenshots. Report security issues privately using
[SECURITY.md](./SECURITY.md).

## Make a change

Read [AGENTS.md](./AGENTS.md) and the [architecture](./docs/architecture.md).
Keep each PR focused and record its intent and expected outcomes in a short spec
using the [TDD template](./docs/templates/tdd-spec-template.md). For behavior changes,
add a failing regression, then implement and refactor with tests passing. For
documentation-only changes, verify links, examples and commands. Update maintained
docs when contracts change.

Keep games driven by rule data, scores derived from events, and multiplayer state
authoritative on the server. Reuse the [UI primitives](./docs/ui-primitives-v0.md)
for accessible mobile controls. Never commit local env files, credentials or game data.

## Validate and open a PR

```sh
npm test
npm run build
npm run check
```

For UI changes, also run the relevant [browser tests](./README.md#check-and-test).
Tests must use local disposable games; avoid production mutations and paid AI calls.
Describe the problem, resulting behavior and checks performed in your PR. Link the
spec for behavior changes and include a screenshot for visible UI changes.
