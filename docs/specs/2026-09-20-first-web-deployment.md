# TDD Spec: First public family deployment

## Intent
Publish the family card app on Cloudflare's workers.dev address.
Protect shared library names and removals for public access.

## Expected outcomes
- Public users can read games, favorite them locally, duplicate them, create house
  variants, play rooms, and keep score.
- PATCH/DELETE of shared rulesets require owner authorization, including archive
  and restore. Anonymous clients see an owner sign-in explanation instead of
  management buttons. The server enforces the same restriction independently.
- Production D1 schema and Durable Object migrations exist. Local games stay local.
- Owner and provider secrets are stored with Wrangler, never committed or printed.
- A live HTTPS address works across independent mobile browser contexts; room
  creation, joining, play, reconnect, and end work. Owner cookie is Secure.

## Tests (red → green)
- Owner route policy rejects public PATCH/DELETE for resolved ruleset routes while
  GET/POST and house-rule creation remain public.
- Existing auth and game tests remain green; npm run check/build pass.
- Live smoke verifies anonymous library writes and AI calls are denied, public
  catalog and gameplay work, and owner authentication permits library management.

## Deployment and rollback
Inspect the account/resources before creating the app. Apply D1 schema before
exposing the final app. Keep previous Durable Object migrations. If live validation
fails, fix and redeploy or disable the worker route; never delete game storage as a
rollback. Keep deployment resource identifiers in ignored local configuration.
