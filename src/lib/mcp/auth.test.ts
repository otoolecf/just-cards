import { beforeEach, describe, expect, it } from 'vitest';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { authorizeMcpRequest, clearMcpAuthCachesForTests } from './auth';

const OAUTH_ENV_KEYS = [
	'JUST_CARDS_MCP_AUTH_TOKEN',
	'JUST_CARDS_MCP_OAUTH_ISSUER',
	'JUST_CARDS_MCP_OAUTH_JWKS_URL',
	'JUST_CARDS_MCP_OAUTH_AUDIENCE',
	'JUST_CARDS_MCP_OAUTH_REQUIRED_SCOPES',
	'JUST_CARDS_MCP_OAUTH_REALM'
] as const;

function clearAuthEnv(): void {
	for (const key of OAUTH_ENV_KEYS) {
		delete process.env[key];
	}
}

function base64UrlJson(value: unknown): string {
	return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signJwt(payload: Record<string, unknown>, privateKeyPem: string, kid = 'kid-1'): string {
	const header = {
		alg: 'RS256',
		typ: 'JWT',
		kid
	};
	const encodedHeader = base64UrlJson(header);
	const encodedPayload = base64UrlJson(payload);
	const signer = createSign('RSA-SHA256');
	signer.update(`${encodedHeader}.${encodedPayload}`);
	signer.end();
	const signature = signer.sign(privateKeyPem).toString('base64url');
	return `${encodedHeader}.${encodedPayload}.${signature}`;
}

describe('mcp oauth auth', () => {
	beforeEach(() => {
		clearAuthEnv();
		clearMcpAuthCachesForTests();
	});

	it('mcp_auth_oauth_validates_jwt_and_required_scope', async () => {
		const issuer = 'https://issuer.example';
		const audience = 'just-cards-mcp';
		process.env.JUST_CARDS_MCP_OAUTH_ISSUER = issuer;
		process.env.JUST_CARDS_MCP_OAUTH_JWKS_URL = `${issuer}/.well-known/jwks.json`;
		process.env.JUST_CARDS_MCP_OAUTH_AUDIENCE = audience;
		process.env.JUST_CARDS_MCP_OAUTH_REQUIRED_SCOPES = 'mcp:tools mcp:resources';

		const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
		const publicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey & Record<string, unknown>;
		publicJwk['kid'] = 'kid-1';
		publicJwk['use'] = 'sig';
		publicJwk['alg'] = 'RS256';

		const now = Math.floor(Date.now() / 1000);
		const token = signJwt(
			{
				iss: issuer,
				aud: audience,
				sub: 'user-123',
				exp: now + 3600,
				iat: now,
				scope: 'mcp:tools mcp:resources'
			},
			privateKey.export({ format: 'pem', type: 'pkcs8' }).toString('utf8')
		);

		const fetchImpl: typeof fetch = async () => {
			return new Response(JSON.stringify({ keys: [publicJwk] }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});
		};

		const request = new Request('http://localhost/api/mcp/tools', {
			method: 'GET',
			headers: {
				authorization: `Bearer ${token}`
			}
		});

		const auth = await authorizeMcpRequest(request, { fetchImpl });
		expect(auth.ok).toBe(true);
		if (auth.ok) {
			expect(auth.mode).toBe('oauth_jwt');
			expect(auth.principal.sub).toBe('user-123');
			expect(auth.principal.scopes).toEqual(['mcp:tools', 'mcp:resources']);
		}
	});

	it('mcp_auth_oauth_returns_invalid_token_challenge', async () => {
		process.env.JUST_CARDS_MCP_OAUTH_ISSUER = 'https://issuer.example';
		process.env.JUST_CARDS_MCP_OAUTH_JWKS_URL = 'https://issuer.example/.well-known/jwks.json';

		const request = new Request('http://localhost/api/mcp/tools', { method: 'GET' });
		const auth = await authorizeMcpRequest(request, {
			fetchImpl: async () => new Response(JSON.stringify({ keys: [] }), { status: 200 })
		});
		expect(auth.ok).toBe(false);
		if (!auth.ok) {
			expect(auth.status).toBe(401);
			expect(auth.headers['WWW-Authenticate']).toContain('Bearer');
			expect(auth.headers['WWW-Authenticate']).toContain('error="invalid_token"');
		}
	});

	it('mcp_auth_oauth_returns_insufficient_scope', async () => {
		const issuer = 'https://issuer.example';
		const audience = 'just-cards-mcp';
		process.env.JUST_CARDS_MCP_OAUTH_ISSUER = issuer;
		process.env.JUST_CARDS_MCP_OAUTH_JWKS_URL = `${issuer}/.well-known/jwks.json`;
		process.env.JUST_CARDS_MCP_OAUTH_AUDIENCE = audience;
		process.env.JUST_CARDS_MCP_OAUTH_REQUIRED_SCOPES = 'mcp:tools';

		const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
		const publicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey & Record<string, unknown>;
		publicJwk['kid'] = 'kid-1';
		publicJwk['use'] = 'sig';
		publicJwk['alg'] = 'RS256';

		const now = Math.floor(Date.now() / 1000);
		const token = signJwt(
			{
				iss: issuer,
				aud: audience,
				sub: 'user-456',
				exp: now + 3600,
				iat: now,
				scope: 'mcp:resources'
			},
			privateKey.export({ format: 'pem', type: 'pkcs8' }).toString('utf8')
		);

		const request = new Request('http://localhost/api/mcp/tools', {
			method: 'GET',
			headers: {
				authorization: `Bearer ${token}`
			}
		});

		const auth = await authorizeMcpRequest(request, {
			fetchImpl: async () =>
				new Response(JSON.stringify({ keys: [publicJwk] }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
		});
		expect(auth.ok).toBe(false);
		if (!auth.ok) {
			expect(auth.status).toBe(403);
			expect(auth.headers['WWW-Authenticate']).toContain('error="insufficient_scope"');
			expect(auth.headers['WWW-Authenticate']).toContain('scope="mcp:tools"');
		}
	});
});
