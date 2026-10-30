# Publication checklist

Use this checklist before publishing the repository or sharing a source archive.
Review the exact files and Git refs you intend to publish, including uncommitted
additions. Ignoring a file does not remove an earlier committed version.

## Latest review

See the [2026-10-30 results](./publication-results-2026-10-30.md) for scans, identity
locations, fixture cleanup and dependency triage. This checklist remains reusable;
its generic concerns are not all unresolved findings in the current tree.

## Secrets and local data

Keep credentials, deployment resource IDs and game data out of Git:

- `.env.local` and `.dev.vars` contain local secrets.
- `.wrangler/` contains resolved deployment configuration and local Worker state.
- `.local/` contains SQLite databases with room records and seat capabilities.
- Build output, screenshots and browser traces can contain local paths or player data.

The repository ignores these paths. Check that they remain ignored and that no
sensitive files were staged explicitly. Publish a reviewed Git checkout rather
than a zip of a working directory containing local state.

Install [Gitleaks](https://github.com/gitleaks/gitleaks) and scan reachable history:

```sh
gitleaks git --log-opts="--all" --redact=100 .
git status --short
git diff --cached --stat
git check-ignore -v .env.local .dev.vars .wrangler/production.json .local/
```

Scan a source-only export separately for uncommitted files. A history scan does
not cover those additions; a whole-checkout directory scan also sees ignored local
secrets and databases. Keep reports redacted and out of Git.

A clean scan cannot guarantee the absence of every credential format. Review
configuration, scripts, fixtures and unexpected binary files manually. If a
credential has been committed, revoke or rotate it before removing it from history.
Review remote branches, tags, release assets and any other material being published;
local scans cannot inspect inaccessible refs or hosting-provider caches.

## Personal information and attribution

Inspect author and committer metadata locally:

```sh
git log --all --format='%h %an <%ae> | %cn <%ce>'
```

This project's history includes the maintainer's email, identifying names and
original checkout paths. Decide whether those are appropriate to publish. Changing
future Git identity settings does not remove older metadata. Agree on a migration
before rewriting shared history.

Retain accurate copyright attribution in `LICENSE`. Review personal context in
project descriptions and avoid committing private player names, room exports or
recovery links. A public deployment hostname is identifying information, not a
credential; `PUBLIC_APP_URL` supplies the generated documentation link.

## Third-party fixtures

The current rule evaluation fixtures are original synthetic HTML summaries. Older
Git revisions contain publisher HTML, including contact information, public telemetry
identifiers and scripts. Review publication of those historical copies.
Where practical, use reduced fixtures that preserve the extraction tests without
unrelated page content. Project code licensing does not establish redistribution
rights for third-party material.

## Dependencies

The lockfile has unresolved dependency advisories. Run `npm audit` and triage
production reachability, severity and available fixes. Development-only and
transitive findings still need assessment; an advisory count alone does not show
whether an application route is affected. Run tests, build and type checking after
updates rather than applying unreviewed automatic fixes.

## Final checks

- Review the full staged diff, including new files and fixtures.
- Confirm public author metadata and copyright attribution are intentional.
- Confirm ignored credentials, game data and deployment IDs are excluded.
- Resolve dependency and fixture redistribution concerns.
- Repeat scans on the exact branch and refs being published.

## Related guides

- [Local setup](../README.md#clone-and-run-locally)
- [Independent deployment](./deployment.md)
- [Engine/storage/hosting boundaries](./code-boundaries.md)
