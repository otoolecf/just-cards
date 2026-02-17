# just-cards

Mobile-first web app for casual, in-person card gaming.

## Docs

- [Inspiration](./docs/inspiration.md)
- [Architecture Plan](./docs/architecture.md)
- [Docs Index](./docs/README.md)

## Stack

- `SvelteKit` (TypeScript)
- Cloudflare Workers runtime via `@sveltejs/adapter-cloudflare`
- `Wrangler` for local Cloudflare dev and deploy

## Local Development

Install dependencies:

```sh
npm install
```

Run SvelteKit local dev server:

```sh
npm run dev
```

Quick run order (scoring-page-first):

```sh
npm run check   # optional but recommended before first run
npm run dev
```

Ruleset storage (local-first):

```sh
# optional; defaults to sqlite in development/test
export RULESET_STORE_DRIVER=sqlite
# optional; default is .local/rulesets.sqlite
export RULESET_SQLITE_PATH=.local/rulesets.sqlite
```

Then open:

```text
http://localhost:5173
http://localhost:5173/play
```

Manual smoke test:

1. Create a session using `Standard`, `Rummy`, or `Cribbage`.
2. Add at least one round with player card rows or quick-text format (`Alice: A H 10S`).
3. Verify standings, event count, and recent events update.
4. Use `Undo`/`Redo` and confirm totals change.
5. Submit one pattern round (target + cards) to confirm pattern scoring reflects.
6. Create a ruleset draft via `POST /api/rulesets` and verify it appears in `GET /api/rulesets`.
7. Open `/play`, select a hand card, and move it to `Board` to verify animated zone transitions.

End-to-end test:

```sh
npm run test:e2e
```

Run Cloudflare local runtime:

```sh
npm run cf:dev
```

Regenerate Cloudflare binding/runtime types (after updating `wrangler.jsonc`):

```sh
npm run cf:types
```

## Build and Deploy

Build app:

```sh
npm run build
```

Build output check:

```sh
npm run check
```

Install Playwright browser binaries once (before first run):

```sh
npx playwright install chromium
```

Deploy to Cloudflare Workers:

```sh
npm run cf:deploy
```

## Testing

Run all tests once:

```sh
npm run test
```

Run tests in watch mode:

```sh
npm run test:watch
```

Run tests with coverage:

```sh
npm run test:coverage
```

## Open Source and Secrets

- `wrangler.jsonc` is committed with non-secret defaults only.
- Local secret values belong in `.dev.vars` (not committed).
- Start from `.dev.vars.example`:

```sh
cp .dev.vars.example .dev.vars
```

- For deployed environments, use Wrangler secrets:

```sh
wrangler secret put SECRET_NAME
```
