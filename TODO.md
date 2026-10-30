# TODO

Outstanding work, ordered by near-term usefulness. Keep implementation details and
acceptance criteria in linked specs; remove items here when they are delivered.

## Next: easier scoring at the table

- [ ] **Take a picture of a player's cards for automatic scoring.** Guided cards
  entry takes too much tapping during a real game. Offer camera capture or photo
  selection, recognize the cards, and show a proposed score for the selected player.
  Let the scorer correct detected cards and confirm before adding the round.
  Apply the selected game's existing rules, including positions/columns where they
  affect scoring, rather than treating every hand as a simple sum. Save the result
  through the score event log so undo/redo and offline score handling stay consistent.
  Keep manual points and card entry available when recognition is uncertain.
  See [scoring contracts](./docs/scorekeeper-rules.md).

## Release and maintenance

- [ ] **Triage dependency advisories.** Assess production reachability and update
  affected dependencies with regression coverage. See the
  [publication checklist](./docs/publication-review.md#dependencies).
- [ ] **Review third-party rule fixtures and public metadata.** Resolve fixture
  redistribution/attribution and confirm author metadata is intended to be public.
  See the [publication checklist](./docs/publication-review.md).
- [ ] **Verify deployment to a fresh Cloudflare account.** Exercise provisioning,
  D1 migrations, owner setup and the live smoke flow using the
  [deployment guide](./docs/deployment.md). Update the `cf:deploy` shortcut to use
  the intended deployment config and apply migrations before serving new code.

## Follow-up development

- [ ] **Connect MCP gameplay to shared rooms.** Replace the separate prototype
  game store with the authoritative room APIs, preserving seat privacy and action
  validation. MCP transport, tools and score leaderboards already exist.
  See [hosting boundaries](./docs/code-boundaries.md) and
  [MCP integration](./docs/chatgpt-mcp-roadmap-v0.md).
- [ ] **Expand imported-policy validation to more game families.** Add dedicated
  behavioral review for Solitaire, Palace, Bridge and Mahjong before allowing
  imported policies for those families to start rooms. Curated built-ins already
  support them. See [ruleset generation](./docs/ruleset-generation-v0.md).
- [ ] **Define saved-room retention and cleanup.** Decide how old closed and
  abandoned room records should expire. Idle-room suspension and active-capacity
  release already exist; saved-data retention is separate. See
  [room lifecycle](./docs/public-rooms.md).

## Ideas to evaluate

- [ ] **Spectator mode.** Allow read-only room participation without exposing
  private hands or consuming a player seat.
- [ ] **Offline multiplayer.** Explore whether reconnect and reconciliation can
  support shared play through network loss. Physical scorekeeping already works
  offline; shared virtual tables currently require a connection.

## Maintaining this list

This is the central backlog. Architecture and feature docs describe contracts and
limitations; unchecked boxes in old specifications are not a current task list.
Add a spec before implementing a feature, and keep this list focused on remaining
work rather than completed milestones or test-run reports.
