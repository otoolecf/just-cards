import { env } from '$env/dynamic/private';

const DEFAULT_REALM = 'just-cards-mcp';
const DEFAULT_OAUTH_SCOPE = 'mcp:tools mcp:resources';
const DEFAULT_JWKS_CACHE_SECONDS = 300;
const DEFAULT_CLOCK_SKEW_SECONDS = 60;

const RSA_HASH_BY_ALG = {
	RS256: 'SHA-256',
	RS384: 'SHA-384',
	RS512: 'SHA-512'
} as const;

type SupportedJwtAlg = keyof typeof RSA_HASH_BY_ALG;

interface OAuthJwtConfig {
	issuer: string;
	jwksUrl: string;
	audience?: string;
	requiredScopes: string[];
	realm: string;
	allowedAlgorithms: SupportedJwtAlg[];
	clockSkewSeconds: number;
}

interface McpAuthConfig {
	mode: 'none' | 'shared_token' | 'oauth_jwt';
	sharedToken?: string;
	oauth?: OAuthJwtConfig;
}

interface JwtHeader {
	alg?: string;
	kid?: string;
	typ?: string;
}

interface JwtClaims {
	iss?: unknown;
	aud?: unknown;
	sub?: unknown;
	exp?: unknown;
	nbf?: unknown;
	iat?: unknown;
	scope?: unknown;
	scp?: unknown;
	[key: string]: unknown;
}

interface JwksDocument {
	keys: JsonWebKey[];
}

interface JwksCacheEntry {
	keys: JsonWebKey[];
	expiresAt: number;
}

interface OAuthPrincipal {
	sub: string;
	scopes: string[];
	claims: Record<string, unknown>;
}

interface OAuthValidationSuccess {
	ok: true;
	principal: OAuthPrincipal;
}

interface OAuthValidationFailure {
	ok: false;
	status: 401 | 403;
	error: 'invalid_token' | 'insufficient_scope';
	errorDescription: string;
	missingScopes?: string[];
}

export interface McpAuthPrincipal {
	sub: string;
	scopes: string[];
	claims?: Record<string, unknown>;
}

export interface McpAuthSuccess {
	ok: true;
	mode: 'none' | 'shared_token' | 'oauth_jwt';
	principal: McpAuthPrincipal;
}

export interface McpAuthFailure {
	ok: false;
	mode: 'shared_token' | 'oauth_jwt';
	status: 401 | 403;
	error: 'invalid_token' | 'insufficient_scope';
	errorDescription: string;
	headers: Record<string, string>;
}

export type McpAuthDecision = McpAuthSuccess | McpAuthFailure;

export interface AuthorizeMcpRequestOptions {
	fetchImpl?: typeof fetch;
	nowMs?: number;
}

const jwksCache = new Map<string, JwksCacheEntry>();

function readPrivateEnv(name: string): string {
	const value = env[name] ?? process.env[name] ?? '';
	return value.trim();
}

function parsePositiveInt(value: string, fallback: number): number {
	if (!value) {
		return fallback;
	}
	const number = Number(value);
	if (!Number.isFinite(number) || number < 0) {
		return fallback;
	}
	return Math.trunc(number);
}

function parseScopes(input: string): string[] {
	if (!input) {
		return [];
	}
	const scopes = input
		.split(/[\s,]+/)
		.map((scope) => scope.trim())
		.filter((scope) => scope.length > 0);
	return [...new Set(scopes)];
}

function parseAllowedAlgorithms(value: string): SupportedJwtAlg[] {
	const parsed = parseScopes(value)
		.map((entry) => entry.toUpperCase())
		.filter((entry): entry is SupportedJwtAlg => entry in RSA_HASH_BY_ALG);
	if (parsed.length === 0) {
		return ['RS256'];
	}
	return parsed;
}

function defaultJwksUrl(issuer: string): string {
	const normalizedIssuer = issuer.endsWith('/') ? issuer.slice(0, -1) : issuer;
	return `${normalizedIssuer}/.well-known/jwks.json`;
}

function getMcpAuthConfig(): McpAuthConfig {
	const oauthIssuer = readPrivateEnv('JUST_CARDS_MCP_OAUTH_ISSUER');
	if (oauthIssuer) {
		const requiredScopesRaw =
			readPrivateEnv('JUST_CARDS_MCP_OAUTH_REQUIRED_SCOPES') || DEFAULT_OAUTH_SCOPE;
		const oauth: OAuthJwtConfig = {
			issuer: oauthIssuer,
			jwksUrl: readPrivateEnv('JUST_CARDS_MCP_OAUTH_JWKS_URL') || defaultJwksUrl(oauthIssuer),
			audience: readPrivateEnv('JUST_CARDS_MCP_OAUTH_AUDIENCE') || undefined,
			requiredScopes: parseScopes(requiredScopesRaw),
			realm: readPrivateEnv('JUST_CARDS_MCP_OAUTH_REALM') || DEFAULT_REALM,
			allowedAlgorithms: parseAllowedAlgorithms(readPrivateEnv('JUST_CARDS_MCP_OAUTH_ALLOWED_ALGS')),
			clockSkewSeconds: parsePositiveInt(
				readPrivateEnv('JUST_CARDS_MCP_OAUTH_CLOCK_SKEW_SECONDS'),
				DEFAULT_CLOCK_SKEW_SECONDS
			)
		};
		return { mode: 'oauth_jwt', oauth };
	}

	const sharedToken = getMcpAuthToken();
	if (sharedToken) {
		return {
			mode: 'shared_token',
			sharedToken
		};
	}

	return { mode: 'none' };
}

function bearerTokenFromAuthorizationHeader(value: string | null): string | undefined {
	if (!value) {
		return undefined;
	}
	const match = value.match(/^Bearer\s+(.+)$/i);
	return match?.[1]?.trim();
}

function requestBearerToken(request: Request): string | undefined {
	return bearerTokenFromAuthorizationHeader(request.headers.get('authorization'));
}

function requestSharedToken(request: Request): string {
	return (
		requestBearerToken(request) ??
		request.headers.get('x-just-cards-auth')?.trim() ??
		''
	);
}

function escapeChallengeValue(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function bearerChallenge(
	realm: string,
	error: 'invalid_token' | 'insufficient_scope',
	errorDescription: string,
	scope?: string
): string {
	const parts = [`realm="${escapeChallengeValue(realm)}"`, `error="${error}"`];
	if (errorDescription) {
		parts.push(`error_description="${escapeChallengeValue(errorDescription)}"`);
	}
	if (scope) {
		parts.push(`scope="${escapeChallengeValue(scope)}"`);
	}
	return `Bearer ${parts.join(', ')}`;
}

function authFailure(
	mode: 'shared_token' | 'oauth_jwt',
	realm: string,
	status: 401 | 403,
	error: 'invalid_token' | 'insufficient_scope',
	errorDescription: string,
	scope?: string
): McpAuthFailure {
	return {
		ok: false,
		mode,
		status,
		error,
		errorDescription,
		headers: {
			'WWW-Authenticate': bearerChallenge(realm, error, errorDescription, scope)
		}
	};
}

function decodeBase64UrlToBytes(value: string): Uint8Array {
	let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
	const remainder = base64.length % 4;
	if (remainder === 2) {
		base64 += '==';
	} else if (remainder === 3) {
		base64 += '=';
	} else if (remainder !== 0) {
		throw new Error('invalid base64url payload');
	}
	const binary = atob(base64);
	const bytes = new Uint8Array(new ArrayBuffer(binary.length));
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

function decodeBase64UrlJson(value: string): Record<string, unknown> {
	const bytes = decodeBase64UrlToBytes(value);
	const text = new TextDecoder().decode(bytes);
	const parsed = JSON.parse(text);
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('decoded token part must be a JSON object');
	}
	return parsed as Record<string, unknown>;
}

function numericClaim(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return undefined;
}

function audClaimIncludes(audClaim: unknown, expectedAudience: string): boolean {
	if (typeof audClaim === 'string') {
		return audClaim === expectedAudience;
	}
	if (Array.isArray(audClaim)) {
		return audClaim.some((entry) => typeof entry === 'string' && entry === expectedAudience);
	}
	return false;
}

function normalizeScopes(scopeClaim: unknown, scpClaim: unknown): string[] {
	const scopes = new Set<string>();
	if (typeof scopeClaim === 'string') {
		for (const scope of parseScopes(scopeClaim)) {
			scopes.add(scope);
		}
	}
	if (typeof scpClaim === 'string') {
		for (const scope of parseScopes(scpClaim)) {
			scopes.add(scope);
		}
	}
	if (Array.isArray(scpClaim)) {
		for (const entry of scpClaim) {
			if (typeof entry === 'string') {
				scopes.add(entry.trim());
			}
		}
	}
	return [...scopes].filter((scope) => scope.length > 0);
}

function maxAgeFromCacheControl(cacheControl: string | null): number | undefined {
	if (!cacheControl) {
		return undefined;
	}
	const match = cacheControl.match(/max-age=(\d+)/i);
	if (!match) {
		return undefined;
	}
	const value = Number(match[1]);
	if (!Number.isFinite(value) || value < 0) {
		return undefined;
	}
	return Math.trunc(value);
}

async function fetchJwks(jwksUrl: string, fetchImpl: typeof fetch, nowMs: number): Promise<JsonWebKey[]> {
	const cached = jwksCache.get(jwksUrl);
	if (cached && cached.expiresAt > nowMs) {
		return cached.keys;
	}

	const response = await fetchImpl(jwksUrl, {
		method: 'GET',
		headers: {
			accept: 'application/json'
		}
	});
	if (!response.ok) {
		throw new Error(`unable to fetch JWKS (${response.status})`);
	}

	const parsed = (await response.json()) as JwksDocument;
	const keys = Array.isArray(parsed?.keys) ? parsed.keys : [];
	if (keys.length === 0) {
		throw new Error('JWKS does not contain signing keys');
	}

	const ttlSeconds = maxAgeFromCacheControl(response.headers.get('cache-control')) ?? DEFAULT_JWKS_CACHE_SECONDS;
	jwksCache.set(jwksUrl, {
		keys,
		expiresAt: nowMs + ttlSeconds * 1000
	});

	return keys;
}

function selectJwkForHeader(keys: JsonWebKey[], header: JwtHeader): JsonWebKey | undefined {
	const jwkKid = (key: JsonWebKey): string | undefined => {
		const value = (key as Record<string, unknown>).kid;
		return typeof value === 'string' ? value : undefined;
	};
	const candidateKeys = keys.filter((key) => key.kty === 'RSA' && typeof key.n === 'string' && typeof key.e === 'string');
	if (header.kid) {
		const kidMatch = candidateKeys.find((key) => jwkKid(key) === header.kid);
		if (kidMatch) {
			return kidMatch;
		}
	}
	return candidateKeys[0];
}

async function verifySignature(
	signingInput: string,
	signature: Uint8Array,
	header: JwtHeader,
	jwk: JsonWebKey
): Promise<boolean> {
	const alg = header.alg as SupportedJwtAlg | undefined;
	if (!alg || !(alg in RSA_HASH_BY_ALG)) {
		return false;
	}
	const hash = RSA_HASH_BY_ALG[alg];
	const key = await crypto.subtle.importKey(
		'jwk',
		jwk,
		{
			name: 'RSASSA-PKCS1-v1_5',
			hash: { name: hash }
		},
		false,
		['verify']
	);
	return crypto.subtle.verify(
		{ name: 'RSASSA-PKCS1-v1_5' },
		key,
		signature as BufferSource,
		new TextEncoder().encode(signingInput)
	);
}

async function validateOAuthJwtToken(
	token: string,
	config: OAuthJwtConfig,
	fetchImpl: typeof fetch,
	nowMs: number
): Promise<OAuthValidationSuccess | OAuthValidationFailure> {
	const parts = token.split('.');
	if (parts.length !== 3) {
		return {
			ok: false,
			status: 401,
			error: 'invalid_token',
			errorDescription: 'bearer token must be a JWT'
		};
	}

	const [encodedHeader, encodedClaims, encodedSignature] = parts;
	let header: JwtHeader;
	let claims: JwtClaims;
	let signatureBytes: Uint8Array;
	try {
		header = decodeBase64UrlJson(encodedHeader) as JwtHeader;
		claims = decodeBase64UrlJson(encodedClaims) as JwtClaims;
		signatureBytes = decodeBase64UrlToBytes(encodedSignature);
	} catch {
		return {
			ok: false,
			status: 401,
			error: 'invalid_token',
			errorDescription: 'bearer token is not valid base64url JSON'
		};
	}

	if (!header.alg || !config.allowedAlgorithms.includes(header.alg as SupportedJwtAlg)) {
		return {
			ok: false,
			status: 401,
			error: 'invalid_token',
			errorDescription: 'bearer token uses unsupported signing algorithm'
		};
	}

	let keys: JsonWebKey[];
	try {
		keys = await fetchJwks(config.jwksUrl, fetchImpl, nowMs);
	} catch {
		return {
			ok: false,
			status: 401,
			error: 'invalid_token',
			errorDescription: 'unable to load signing keys for token validation'
		};
	}

	const jwk = selectJwkForHeader(keys, header);
	if (!jwk) {
		return {
			ok: false,
			status: 401,
			error: 'invalid_token',
			errorDescription: 'no matching signing key found for bearer token'
		};
	}

	const signingInput = `${encodedHeader}.${encodedClaims}`;
	const signatureValid = await verifySignature(signingInput, signatureBytes, header, jwk).catch(() => false);
	if (!signatureValid) {
		return {
			ok: false,
			status: 401,
			error: 'invalid_token',
			errorDescription: 'bearer token signature validation failed'
		};
	}

	if (claims.iss !== config.issuer) {
		return {
			ok: false,
			status: 401,
			error: 'invalid_token',
			errorDescription: 'bearer token issuer does not match expected issuer'
		};
	}

	if (config.audience && !audClaimIncludes(claims.aud, config.audience)) {
		return {
			ok: false,
			status: 401,
			error: 'invalid_token',
			errorDescription: 'bearer token audience does not include this resource server'
		};
	}

	const nowSeconds = Math.floor(nowMs / 1000);
	const skew = config.clockSkewSeconds;
	const exp = numericClaim(claims.exp);
	if (exp !== undefined && nowSeconds > exp + skew) {
		return {
			ok: false,
			status: 401,
			error: 'invalid_token',
			errorDescription: 'bearer token expired'
		};
	}

	const nbf = numericClaim(claims.nbf);
	if (nbf !== undefined && nowSeconds + skew < nbf) {
		return {
			ok: false,
			status: 401,
			error: 'invalid_token',
			errorDescription: 'bearer token not yet valid'
		};
	}

	const iat = numericClaim(claims.iat);
	if (iat !== undefined && iat > nowSeconds + skew) {
		return {
			ok: false,
			status: 401,
			error: 'invalid_token',
			errorDescription: 'bearer token issued-at value is in the future'
		};
	}

	const scopes = normalizeScopes(claims.scope, claims.scp);
	const missingScopes = config.requiredScopes.filter((scope) => !scopes.includes(scope));
	if (missingScopes.length > 0) {
		return {
			ok: false,
			status: 403,
			error: 'insufficient_scope',
			errorDescription: 'bearer token does not include required scopes',
			missingScopes
		};
	}

	const subject = typeof claims.sub === 'string' && claims.sub.trim().length > 0 ? claims.sub.trim() : 'oauth-subject';
	return {
		ok: true,
		principal: {
			sub: subject,
			scopes,
			claims
		}
	};
}

export function getMcpAuthToken(): string {
	return readPrivateEnv('JUST_CARDS_MCP_AUTH_TOKEN');
}

export function isAuthorizedMcpRequest(request: Request, expectedToken: string): boolean {
	if (!expectedToken) {
		return true;
	}
	return requestSharedToken(request) === expectedToken;
}

export function getMcpAuthMode(): 'none' | 'shared_token' | 'oauth_jwt' {
	return getMcpAuthConfig().mode;
}

export async function authorizeMcpRequest(
	request: Request,
	options: AuthorizeMcpRequestOptions = {}
): Promise<McpAuthDecision> {
	const config = getMcpAuthConfig();
	const nowMs = options.nowMs ?? Date.now();

	if (config.mode === 'none') {
		return {
			ok: true,
			mode: 'none',
			principal: {
				sub: 'anonymous',
				scopes: []
			}
		};
	}

	if (config.mode === 'shared_token') {
		const provided = requestSharedToken(request);
		if (config.sharedToken && provided === config.sharedToken) {
			return {
				ok: true,
				mode: 'shared_token',
				principal: {
					sub: 'shared-token-client',
					scopes: []
				}
			};
		}
		return authFailure(
			'shared_token',
			DEFAULT_REALM,
			401,
			'invalid_token',
			'valid bearer token is required'
		);
	}

	const oauth = config.oauth;
	if (!oauth) {
		return authFailure('oauth_jwt', DEFAULT_REALM, 401, 'invalid_token', 'OAuth configuration missing');
	}

	const token = requestBearerToken(request);
	if (!token) {
		return authFailure('oauth_jwt', oauth.realm, 401, 'invalid_token', 'bearer token is required');
	}

	const fetchImpl = options.fetchImpl ?? fetch;
	const validation = await validateOAuthJwtToken(token, oauth, fetchImpl, nowMs);
	if (!validation.ok) {
		return authFailure(
			'oauth_jwt',
			oauth.realm,
			validation.status,
			validation.error,
			validation.errorDescription,
			validation.error === 'insufficient_scope' ? oauth.requiredScopes.join(' ') : undefined
		);
	}

	return {
		ok: true,
		mode: 'oauth_jwt',
		principal: {
			sub: validation.principal.sub,
			scopes: validation.principal.scopes,
			claims: validation.principal.claims
		}
	};
}

export function getMcpProtectedResourceMetadata(origin: string): {
	resource: string;
	authorization_servers?: string[];
	scopes_supported?: string[];
	bearer_methods_supported: string[];
	resource_documentation?: string;
} {
	const config = getMcpAuthConfig();
	const resource = `${origin}/api/mcp`;

	if (config.mode === 'oauth_jwt' && config.oauth) {
		return {
			resource,
			authorization_servers: [config.oauth.issuer],
			scopes_supported: [...config.oauth.requiredScopes],
			bearer_methods_supported: ['header'],
			resource_documentation: `${origin}/docs/chatgpt-mcp-roadmap-v0.md`
		};
	}

	return {
		resource,
		bearer_methods_supported: ['header'],
		resource_documentation: `${origin}/docs/chatgpt-mcp-roadmap-v0.md`
	};
}

export function clearMcpAuthCachesForTests(): void {
	jwksCache.clear();
}
