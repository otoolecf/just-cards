const encoder = new TextEncoder();
export const OWNER_SESSION_SECONDS = 8 * 3600;
export const protectedOwnerPath = (route: string, method = 'GET') => {
	const path = route.replace(/\/+$/, '');
	return (
		(['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && (path === '/api/rulesets' || path.startsWith('/api/rulesets/'))) ||
		path === '/api/rulesets/generate' ||
		path === '/api/mcp' ||
		path.startsWith('/api/mcp/') ||
		path === '/api/chat/actions' || path === '/api/owner/resources'
	);
};
export function sameOrigin(request: Request): boolean {
	const origin = request.headers.get('origin');
	return (
		(!origin || origin === new URL(request.url).origin) &&
		request.headers.get('sec-fetch-site') !== 'cross-site'
	);
}
async function hmac(key: string) {
	return crypto.subtle.importKey(
		'raw',
		encoder.encode(key),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify'],
	);
}
const hex = (bytes: ArrayBuffer) =>
	Array.from(new Uint8Array(bytes), (n) =>
		n.toString(16).padStart(2, '0'),
	).join('');
async function sign(key: string, value: string) {
	return crypto.subtle.sign('HMAC', await hmac(key), encoder.encode(value));
}
export async function validOwnerKey(
	candidate: string,
	configured: string | undefined,
): Promise<boolean> {
	if (!configured || configured.length < 32 || candidate.length > 512)
		return false;
	// Fixed-length, constant-time Web Crypto verification instead of comparing secrets.
	return crypto.subtle.verify(
		'HMAC',
		await hmac(configured),
		await sign(candidate || 'empty', 'owner-key'),
		encoder.encode('owner-key'),
	);
}
export async function ownerCookie(
	key: string,
	now = Date.now(),
): Promise<string> {
	const payload = `${now + OWNER_SESSION_SECONDS * 1000}.${crypto.randomUUID()}`;
	return `${payload}.${hex(await sign(key, payload))}`;
}
export async function ownerAuthorized(
	request: Request,
	key: string | undefined,
	now = Date.now(),
): Promise<boolean> {
	if (!key || key.length < 32 || !sameOrigin(request)) return false;
	const header = request.headers.get('x-just-cards-owner-key');
	if (header) return validOwnerKey(header, key);
	const cookie = request.headers
		.get('cookie')
		?.split(';')
		.map((c) => c.trim())
		.find((c) => c.startsWith('jc_owner='))
		?.slice(9);
	if (!cookie || cookie.length > 160) return false;
	const [expiry, nonce, signature, ...extra] = cookie.split('.');
	if (
		extra.length ||
		!nonce ||
		!signature ||
		!/^[0-9a-f]{64}$/.test(signature) ||
		!Number.isFinite(Number(expiry)) ||
		Number(expiry) <= now ||
		Number(expiry) > now + OWNER_SESSION_SECONDS * 1000
	)
		return false;
	return crypto.subtle.verify(
		'HMAC',
		await hmac(key),
		Uint8Array.from(signature.match(/../g)!, (h) => parseInt(h, 16)),
		encoder.encode(`${expiry}.${nonce}`),
	);
}
