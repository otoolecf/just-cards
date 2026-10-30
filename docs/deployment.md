# Deploy to your own Cloudflare account

This deploys an independent installation: your own Worker, D1 catalog, room state,
and owner key. Existing installations and local games are not copied.
Complete the [local setup](../README.md#clone-and-run-locally) first. You need a
Cloudflare account with Workers, D1 and SQLite-backed Durable Objects available.
Check current [Durable Object pricing/availability](https://developers.cloudflare.com/durable-objects/platform/pricing/)
and account limits before deploying; usage may incur charges.
A domain is optional: you can use your account's workers.dev address.

## 1. Select your account

```sh
npx wrangler login
npx wrangler whoami
```

Verify that the displayed account is yours. If you have multiple accounts, set
`account_id` in the ignored deployment config below to select the intended one.
Do not copy the maintainer's `.wrangler/` directory, database IDs or secrets.

## 2. Make a private deployment config

```sh
mkdir -p .wrangler
cp wrangler.jsonc .wrangler/deploy.jsonc
```

Do this copy once; on subsequent deployments keep the config and its database ID.
Edit `.wrangler/deploy.jsonc`. Paths resolve relative to that file, so change:

| Field | Value |
| --- | --- |
| `$schema` | `../node_modules/wrangler/config-schema.json` |
| `main` | `../.svelte-kit/cloudflare/_worker.js` |
| `assets.directory` | `../.svelte-kit/cloudflare` |
| `d1_databases[0].migrations_dir` | `../migrations` |
| `name` | Your Worker name, for example `just-cards-personal` |
| `d1_databases[0].database_name` | Your database name, for example `just-cards-personal-rulesets` |
| `workers_dev` | Add `true` at the top level to publish on workers.dev |

Preserve binding names `ROOMS`, `ROOM_ADMISSION`, `RULESETS_DB`, and `ASSETS`, both
Durable Object classes and the `migrations` array. Application code depends on them.
Keep the committed `wrangler.jsonc` free of your account/resource IDs.

## 3. Provision D1 and record its ID

Use the database name chosen above:

```sh
npx wrangler d1 create just-cards-personal-rulesets --config .wrangler/deploy.jsonc --update-config=false
```

Copy the returned ID into `d1_databases[0].database_id` in the ignored config.
If you already created this installation's database, reuse its ID instead of
creating another. Confirm the account and database name before continuing.
See [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/).

## 4. Build, migrate, then deploy

```sh
npm run test
npm run build
npm run check
npx wrangler deploy --dry-run --config .wrangler/deploy.jsonc
npx wrangler d1 migrations apply RULESETS_DB --remote --config .wrangler/deploy.jsonc
npx wrangler deploy --config .wrangler/deploy.jsonc
```

Review and confirm the migration prompt. D1 schema is applied before the Worker
serves traffic. Durable Object class migrations are applied by Wrangler at deploy.
The final command prints your live HTTPS URL. These explicit commands use the
same private config throughout. The current `npm run cf:deploy` shortcut uses the
source config and deploys before migrating D1; it is not this first-install path.

## 5. Configure optional secrets

Built-in games work without an AI key. For owner management/imports, generate a
random secret of at least 32 characters with your password manager, then enter it
at Wrangler's prompt:

```sh
npx wrangler secret put OWNER_ACCESS_KEY --config .wrangler/deploy.jsonc
```

Sign in at `/owner` with that secret. For paid model-assisted rule generation,
optionally set the provider key through a separate prompt:

```sh
npx wrangler secret put OPENAI_API_KEY --config .wrangler/deploy.jsonc
```

Local `.env.local` and `.dev.vars` files do not install production secrets. Never
paste secrets into tracked config or command-line arguments. MCP setup also needs
its own [authentication configuration](./mcp-oauth-setup.md).

## 6. Verify the live installation

1. Open `/` on the printed HTTPS URL. Create a two-player scoring session, add
   manual points, use Undo/Redo, reload, and check saved totals.
2. Open `/play`, create Six Card Golf, and join the invite in a separate browser
   context. Deal, reveal initial cards, take turns drawing/swapping/discarding,
   and reload one player. Confirm private hands and the Live connection indicator.
3. End the test room to release its active-room slot. If a command reports
   “The table changed”, reload to obtain the latest revision and retry.
4. Without owner sign-in, confirm imports and shared catalog management are
   unavailable. If configured, sign in at `/owner` and check access appears.
5. Inspect mobile width and browser console for layout or runtime errors.

Do not use capacity/load test scripts against a live installation with real games.
The automated Python deployment smoke requires Python Playwright, a Chrome binary,
and an ignored `.dev.vars` containing this installation's owner key; see
`tests/browser/deployment_smoke.py` before opting into that broader test.

## Updating and troubleshooting

Before each update, run tests/check/build, review new migrations, merge any binding
changes from `wrangler.jsonc` into your ignored config, then use the same explicit
remote-migration and deploy commands. Do not reset Durable Object migration tags.

- Missing `RULESETS_DB` or SQL table errors: check the binding ID and apply the
  migrations using the same config/account as the deployment.
- Missing room bindings: preserve both Durable Object bindings and migrations.
- Owner login fails: confirm the deployed key is at least 32 characters and use HTTPS.
- Local data is absent: local SQLite/Wrangler stores are separate from production.

For a code-only rollback, inspect `npx wrangler deployments list --config
.wrangler/deploy.jsonc`, then use `npx wrangler rollback --config
.wrangler/deploy.jsonc` and select the intended prior version. A Worker rollback
is not a database restore. Do not delete D1 or room storage to roll back code.

## Render your documentation link

```sh
PUBLIC_APP_URL=https://your-worker.your-subdomain.workers.dev npm run docs:build
```

Generated docs live in ignored `.output/docs/`. This does not change runtime routes
or publish documentation automatically.

## Public URL and search discovery

The primary installation uses `https://justcards.app`. Page metadata, social sharing
and `/sitemap.xml` default to that origin. Independent deployments should set
`PUBLIC_APP_URL` in `.env.local` or the build environment before `npm run build`.
`/robots.txt` advertises the sitemap using the same origin. The sitemap includes
Score, Play and stored public rulesets, including drafts. Owner access and shared
rooms use `noindex` and are excluded from the sitemap. Canonicals omit queries;
room sharing metadata points to `/play` rather than exposing a room code.

For a Cloudflare-managed custom domain, add this to your ignored deployment config:

```json
"routes": [{ "pattern": "your-domain.example", "custom_domain": true }]
```

The primary installation sets the pattern to `justcards.app`. Wrangler attaches
the domain during deploy. Retain your existing bindings and database configuration.
See [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
Social previews use the existing 512px PNG app icon and page-specific descriptions.
After deployment, optionally verify your domain in Google Search Console, submit
`/sitemap.xml`, and request indexing for `/` and `/play`. Search engines can also
discover the site through public links; submission does not guarantee indexing.
