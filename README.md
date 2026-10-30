# just-cards

> **About this project:** Just Cards is a personal side project built to make spontaneous, in-person card games easier. Keeping score in a notes app can be cumbersome, pen and paper aren’t always handy, and sometimes you don’t even have a deck. Just Cards helps fill those gaps so you can spend more time playing while learning unfamiliar games more easily. Substantial portions of the code and documentation were developed with AI assistance. Expect rough edges; bug reports and contributions are welcome.

A mobile-first scorekeeper and shared card table for casual, in-person games.
Use physical cards and enter scores, or join a room to play together on phones.
Games are described by versioned rule bundles; score totals come from an event log.

Built with SvelteKit and TypeScript. Cloudflare Workers, Durable Objects, and D1
are the supported production target. Local development uses SQLite without a
Cloudflare account. The code is licensed under [MIT](./LICENSE).

## Clone and run locally

Install Git and **Node.js 22.13 or newer on the Node 22 release line**, with npm.
Node 18 and 20 are not sufficient for the default local storage: it uses built-in
`node:sqlite`.
See the [Node SQLite version history](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html).

```sh
git clone https://github.com/otoolecf/just-cards.git
cd just-cards
node --version
npm ci
npm run dev
```

Open [localhost:5173](http://localhost:5173) for scoring or
[localhost:5173/play](http://localhost:5173/play) for shared play. Run commands
from the repository root. Neither environment files, AI keys, Cloudflare login,
nor a separate database server are required to try the built-in games.

Try scoring: enter two player names, create a session, enter signed manual points,
add a round, then try Undo and Redo. Reload to check saved totals.

Try play: create a Six Card Golf room, open its invite in an incognito window
(or another browser), join under a second name, and deal. Each browser has its
own seat and private cards. End the room when finished. Vite development uses
HTTP polling; use the Worker runtime below to test live WebSockets.

Local data is created under ignored `.local/`: `rulesets.sqlite`, `scores.sqlite`,
`rooms.sqlite`, and `admission.sqlite`. Restarting the server preserves it. Vite
and Wrangler use separate local storage, and neither copies games to production.
The SQLite experimental warning on Node 22 is expected. Vite may also warn that
internal Durable Object bindings are unavailable; these development routes use
the local adapters. Use `npm run cf:dev` to exercise the Durable Objects themselves.

## Check and test

Build before checking on a fresh checkout: Wrangler infers typed Durable Object
bindings from the generated Worker exports.

```sh
npm run test
npm run build
npm run check
```

For browser tests, install Chromium once, then run:

```sh
npx playwright install chromium
npm run test:e2e
```

`npm run test:golden` and `npm run test:confidence` exercise offline ruleset
fixtures and bundle validation. No provider key is needed.

## Run the Cloudflare runtime locally

```sh
npm run cf:dev
```

Open the localhost URL Wrangler prints (normally port 8787). This builds the app,
applies local D1 migrations, and starts Workers with local D1/Durable Object
storage under ignored `.wrangler/`. It exercises the deployed storage adapters
and WebSocket transport without publishing a site. See
[Cloudflare local development](https://developers.cloudflare.com/workers/local-development/).

Use `npm run cf:types` after binding changes. `npm run preview` is not the full
Worker integration test; prefer `npm run cf:dev` for that purpose.

## Optional owner and AI features

For Vite, put optional values in ignored `.env.local`. For Wrangler, copy
`.dev.vars.example` to `.dev.vars` **only if that file does not already exist**.
Never overwrite existing credentials just to try the examples.

Set `OWNER_ACCESS_KEY` to a random secret of at least 32 characters and sign in
at `/owner` to enable catalog management and rules imports. Add `OPENAI_API_KEY`
only if you want model-assisted generation; calls can incur provider charges.
Without an owner key, protected administration/import/MCP endpoints stay disabled;
built-in play and scoring work. Model names can be overridden with
`RULESET_LLM_PRIMARY_MODEL` and `RULESET_LLM_FALLBACK_MODEL`.

MCP clients need owner authorization plus the MCP authentication described in
[MCP OAuth setup](./docs/mcp-oauth-setup.md).

## Deploy your own site

Follow [Deploy to your own Cloudflare account](./docs/deployment.md). It explains
account selection, an ignored deployment config, D1 provisioning, migrations,
secrets, and a live smoke test. Use that explicit sequence for a first deployment.

## Documentation build

Inline file references are relative to the repository root; Markdown links are
relative to their document. Set `PUBLIC_APP_URL` in `.env.local` (see `.env.example`),
or provide it when building:

```sh
PUBLIC_APP_URL=https://cards.example.com npm run docs:build
```

This renders Markdown into ignored `.output/docs/`, filling the hosted-app URL
placeholder. Missing/invalid URLs fail the docs build. Source docs remain unchanged.
This is a separate documentation build; it does not publish docs with the app.

## Read next

- [TODO and planned improvements](./TODO.md)

- [Engine, storage, and hosting boundaries](./docs/code-boundaries.md)
- [Pre-publication review](./docs/publication-review.md)
- [Why this project exists](./docs/inspiration.md)
- [Architecture and roadmap](./docs/architecture.md)
- [Documentation index](./docs/README.md)
