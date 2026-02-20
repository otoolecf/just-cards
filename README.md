# just-cards

Mobile-first web app for casual, in-person card gaming.

## Docs

- [Inspiration](./docs/inspiration.md)
- [Architecture Plan](./docs/architecture.md)
- [Docs Index](./docs/README.md)
- [MCP OAuth Setup](./docs/mcp-oauth-setup.md)

## Stack

- `SvelteKit` (TypeScript)
- Cloudflare Workers runtime via `@sveltejs/adapter-cloudflare`
- `fastmcp` (`EdgeFastMCP`) for MCP transport/tool/resource wiring
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

Ruleset LLM generation (optional):

```sh
# in .env.local for npm run dev, or .dev.vars for wrangler dev
OPENAI_API_KEY=your-key-here
# optional model overrides
RULESET_LLM_PRIMARY_MODEL=gpt-5-nano
RULESET_LLM_FALLBACK_MODEL=gpt-5-mini
```

MCP auth (optional):

```sh
# simple local token mode
JUST_CARDS_MCP_AUTH_TOKEN=local-mcp-token

# OAuth JWT mode (production-style; requires issuer/JWKS)
JUST_CARDS_MCP_OAUTH_ISSUER=https://your-auth.example.com
JUST_CARDS_MCP_OAUTH_JWKS_URL=https://your-auth.example.com/.well-known/jwks.json
JUST_CARDS_MCP_OAUTH_AUDIENCE=just-cards-mcp
JUST_CARDS_MCP_OAUTH_REQUIRED_SCOPES="mcp:tools mcp:resources"
```

See full guide: [MCP OAuth Setup](./docs/mcp-oauth-setup.md)

Generation and play-loader server logs are emitted as structured lines prefixed with `[just-cards]` for easier debugging.

Then open:

```text
http://localhost:5173
http://localhost:5173/play
http://localhost:5173/play/<rulesetId>
```

Manual smoke test:

1. Create a session using `Standard`, `Rummy`, or `Cribbage`.
2. Add at least one round with player card rows or quick-text format (`Alice: A H 10S`).
3. Verify standings, event count, and recent events update.
4. Use `Undo`/`Redo` and confirm totals change.
5. Submit one pattern round (target + cards) to confirm pattern scoring reflects.
6. Create a ruleset draft via `POST /api/rulesets` and verify it appears in `GET /api/rulesets`.
   Use `runtime-bundle/v1` payloads (`runtimeRulePack` + `uiProfile`), or omit `uiProfile` to use backend generation defaults.
7. In `Rulesets` panel on `/`, generate one ruleset from URL or prose input and verify it appears in the list.
8. Open `/play` for demo mode, then open `/play/{rulesetId}` (using generated or created ID) to verify ruleset-driven labels/zones/actions.
9. Select a hand card and play/draw cards to confirm movement + action controls remain functional.

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

Run golden ruleset evals (offline fixtures from target rule links):

```sh
npm run test:golden
```

Run full confidence gate (bundle runtime/UI checks + golden evals):

```sh
npm run test:confidence
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
