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
