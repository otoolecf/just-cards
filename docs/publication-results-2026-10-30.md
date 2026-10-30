# Publication review results — 2026-10-30

## Scope

Reviewed the current source tree and all 25 reachable commits at the start of this
review, including local Codex refs. Fetched remote refs: the remote advertised only
`main`, with no tags. GitHub CLI credentials could not access repository metadata;
release assets, Actions artifacts/logs, hidden remote refs, forks and provider caches
are outside this review. Repository visibility has not been changed.

## Secrets and local state — passed within scanned scope

Gitleaks 8.30.1 with default rules and full redaction found zero findings in reachable
history and the source-only export. Two configured local secret values were compared
to historical Git object content without printing them: zero matches.

Ignored local env files, `.wrangler/`, `.local/`, build output and browser artifacts
remain excluded. No real env file, private key or database filename was found in the
tracked file list/history; only non-secret env templates are tracked. The current
tracked binary images are the three intended app icons. The rate-limit namespace
`1001` is a configured logical identifier, not a credential or Cloudflare account ID.
Private deployment resource IDs remain in the ignored deployment config.

Reports are local under `/tmp/just-cards-publication-*`; they are not committed.
These scans cannot prove the absence of every possible secret format.

## Identity — reviewed; email rewrite authorized

Before cleanup, all 25 commits used the maintainer's personal email in author
metadata, and 24 in committer metadata. The initial commit used the full name;
subsequent commits used the GitHub username. The initial committer was GitHub's
public no-reply identity. The maintainer authorized replacing their email with the
ID-based GitHub noreply address in existing history and future local commits.
Names, dates and code history are preserved; commit hashes change.

The full name remains intentionally in `LICENSE:3`, with the MIT grant intact.
GitHub username occurrences remain in the README clone URL, source footer, related
tests/specs and the previous public Workers hostname in the security audit.
The public GitHub profile shows name/username but no email address; the unauthenticated
GitHub user API returned `email: null`. No profile settings were changed.

Forty historical file paths contain the original checkout directory. Examples include
older AGENTS.md, architecture docs, ruleset docs and specs. These paths remain in
history: an email-only metadata rewrite does not alter file contents.

## Third-party fixtures — current tree cleaned; historical copies remain

Replaced three complete publisher HTML downloads (258,041 bytes total) with small,
original synthetic rule-extraction inputs. Removed publisher scripts, telemetry and
contact details from the current fixtures. Added fixture provenance and regression
coverage, and updated both golden/confidence consumers and their documentation.
All existing extraction expectations are retained. Tests no longer assert compatibility
with current publisher HTML; publisher URLs remain source-detection test inputs.

The original downloads remain in earlier commits. This review has not established
permission to redistribute those historical copies. Before exposing that history,
remove those historical fixture blobs with a separately authorized rewrite, publish
from fresh reviewed history, or resolve redistribution permission. An email metadata
rewrite alone does not resolve this item.

## Dependency triage — low findings retained with documented exposure

Fresh `npm audit --json`: 9 low entries, zero moderate/high/critical. Production-only
report: 8 low entries. Counts include propagated/transitive entries rather than nine
independent application vulnerabilities. No force-fix, downgrade or major framework
migration was applied.

- [Enhanced-form redirect](https://github.com/sveltejs/kit/security/advisories/GHSA-pfhg-q3qv-9q6r):
  no `use:enhance` or form-action enhancement was found in application source.
- [Prerender cache-header XSS](https://github.com/sveltejs/kit/security/advisories/GHSA-27mw-82g8-phjj):
  no application prerender opt-in or forwarding of untrusted cache-control into
  prerendered page headers was found. Current response cache policies are fixed.
- [Cookie serialization](https://github.com/jshttp/cookie/security/advisories/GHSA-pxg6-pf52-xh8x):
  SvelteKit retains cookie 0.6.0. The application's owner cookie name and path are
  fixed (`jc_owner`, `/`); no untrusted name/domain/path input was found.
- [deepmerge prototype poisoning](https://github.com/advisories/GHSA-gcqx-w48m-w2h4):
  installed 4.3.1 is used in Vite plugin configuration merging, not an identified
  public application request path. Build/config inputs must remain trusted.
- The adapter, runed, bits-ui, svelte-toolbelt and Vite plugin/inspector entries
  propagate the above affected dependency paths. npm's proposed fixes include a
  SvelteKit 3/adapter 8 migration and a bits-ui downgrade; these warrant their own
  compatibility work rather than an automatic publication cleanup.

No exploit was reproduced during this dependency triage. The installed versions
remain affected according to the registry; code-path review is not a blanket
statement of non-exploitability.

## Validation and outstanding decisions

The fixture publication assertions failed against copied pages before replacement.
The complete unit suite passed: 441 tests across 80 files. Type checking reported
zero errors/warnings, and the production build passed. CI already runs tests/check/build, a
high-severity npm audit threshold, and Gitleaks on pushes and pull requests.

Remaining publication item: historical copied HTML and local checkout paths are
still present in old file versions. Keep identity/copyright attribution intact.
The production runtime was not changed by this fixture/documentation cleanup.
