# MCP OAuth Setup Guide

This guide covers authentication setup for Just Cards MCP endpoints.

## Short Answer

Do you need an external provider?

1. For local testing: No. Use shared token mode (`JUST_CARDS_MCP_AUTH_TOKEN`).
2. For production OAuth flows: Yes. You need an OAuth/OIDC authorization server (external IdP or self-hosted provider) that issues JWT access tokens and exposes a JWKS endpoint.

## Supported Auth Modes

1. `none` mode
- No auth env vars set.
- Intended only for local/dev experiments.

2. `shared_token` mode
- Set `JUST_CARDS_MCP_AUTH_TOKEN`.
- Clients send `Authorization: Bearer <token>`.
- Good for local tooling and quick integration tests.

3. `oauth_jwt` mode
- Enabled when `JUST_CARDS_MCP_OAUTH_ISSUER` is set.
- Server validates bearer JWTs using issuer/JWKS (plus optional audience/scope checks).
- Recommended for remote/client-facing deployments.

## Endpoints

MCP endpoints:

1. `POST /api/mcp` (primary MCP streamable HTTP endpoint)
2. `GET /api/mcp` and `DELETE /api/mcp` (transport lifecycle behavior)
3. Compatibility endpoints:
- `GET /api/mcp/sse` (redirects to `/api/mcp`)
- `POST /api/mcp/messages?sessionId=...`
- `GET /api/mcp/tools`, `GET /api/mcp/resources`, `POST /api/mcp/call`

OAuth discovery endpoint:

1. `GET /.well-known/oauth-protected-resource`

## OAuth Environment Variables

Set these in `.dev.vars` for `wrangler dev` or environment secrets in deployed environments.

Required to enable OAuth mode:

1. `JUST_CARDS_MCP_OAUTH_ISSUER`

Optional but recommended:

1. `JUST_CARDS_MCP_OAUTH_JWKS_URL`
- Defaults to `{issuer}/.well-known/jwks.json`.

2. `JUST_CARDS_MCP_OAUTH_AUDIENCE`
- Expected JWT `aud` claim for this API.

3. `JUST_CARDS_MCP_OAUTH_REQUIRED_SCOPES`
- Defaults to `mcp:tools mcp:resources`.

4. `JUST_CARDS_MCP_OAUTH_REALM`
- Used in `WWW-Authenticate` challenge headers.

5. `JUST_CARDS_MCP_OAUTH_ALLOWED_ALGS`
- Space/comma separated, defaults to `RS256`.

6. `JUST_CARDS_MCP_OAUTH_CLOCK_SKEW_SECONDS`
- Default `60`.

Shared-token fallback:

1. `JUST_CARDS_MCP_AUTH_TOKEN`

## Example `.dev.vars`

```env
# Shared token mode (simple local testing)
JUST_CARDS_MCP_AUTH_TOKEN=local-mcp-token

# OAuth JWT mode (production-style)
JUST_CARDS_MCP_OAUTH_ISSUER=https://your-auth.example.com
JUST_CARDS_MCP_OAUTH_JWKS_URL=https://your-auth.example.com/.well-known/jwks.json
JUST_CARDS_MCP_OAUTH_AUDIENCE=just-cards-mcp
JUST_CARDS_MCP_OAUTH_REQUIRED_SCOPES="mcp:tools mcp:resources"
JUST_CARDS_MCP_OAUTH_REALM=just-cards-mcp
JUST_CARDS_MCP_OAUTH_ALLOWED_ALGS=RS256
JUST_CARDS_MCP_OAUTH_CLOCK_SKEW_SECONDS=60
```

If `JUST_CARDS_MCP_OAUTH_ISSUER` is set, OAuth mode takes precedence over shared-token mode.

## Provider Requirements

Any provider is fine if it can:

1. Issue signed JWT access tokens.
2. Expose JWKS publicly to your MCP resource server.
3. Include expected claims (`iss`, `exp`, optional `aud`, optional `scope`/`scp`).
4. Allow scope configuration (`mcp:tools`, `mcp:resources`).

Examples: Auth0, WorkOS/AuthKit, Clerk, Okta, Keycloak, Zitadel, or your own OIDC server.

## Best Practices

1. Always set `JUST_CARDS_MCP_OAUTH_AUDIENCE` in production.
2. Keep `JUST_CARDS_MCP_OAUTH_REQUIRED_SCOPES` minimal and explicit.
3. Use short-lived access tokens and rely on refresh tokens in your client app.
4. Do not log bearer tokens.
5. Store secrets in provider/Wrangler secret management, never git.

## Quick Verification

1. Start app and call:
- `GET /.well-known/oauth-protected-resource`

2. Confirm response includes:
- `resource`
- `authorization_servers`
- `scopes_supported`

3. Send a request to `GET /api/mcp/tools` with:
- missing token: expect `401` and `WWW-Authenticate`
- invalid token: expect `401`
- valid token missing scope: expect `403`
- valid token with required scope: expect `200`

## Notes for ChatGPT/MCP Clients

1. Use the protected resource metadata endpoint to discover auth expectations.
2. Use bearer tokens in the `Authorization` header.
3. For SSE transport:
- open `GET /api/mcp/sse`
- post JSON-RPC messages to emitted endpoint with `sessionId`
