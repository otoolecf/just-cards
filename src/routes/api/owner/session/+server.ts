import type { RequestHandler } from './$types';
import {
	ownerAuthorized,
	ownerCookie,
	validOwnerKey,
	sameOrigin,
	OWNER_SESSION_SECONDS,
} from '$lib/server/owner-auth';
import { ownerKey } from '$lib/server/owner-config';
const respond = (body: unknown, status = 200) =>
	Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
export const GET: RequestHandler = async ({ request, platform }) =>
	respond({ owner: await ownerAuthorized(request, ownerKey(platform)) });
export const POST: RequestHandler = async ({
	request,
	platform,
	cookies,
	url,
}) => {
	if (!sameOrigin(request))
		return respond({ error: 'Please sign in from this site.' }, 403);
	const body = await request.text();
	if (body.length > 1024) return respond({ error: 'Invalid owner key.' }, 403);
	let candidate = '';
	try {
		candidate = JSON.parse(body).key;
	} catch {
		/* Invalid input is rejected below. */
	}
	const key = ownerKey(platform);
	if (typeof candidate !== 'string' || !(await validOwnerKey(candidate, key)))
		return respond(
			{ error: 'Owner access is not configured, or the key is incorrect.' },
			403,
		);
	cookies.set('jc_owner', await ownerCookie(key!), {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: url.protocol === 'https:',
		maxAge: OWNER_SESSION_SECONDS,
	});
	return respond({ owner: true });
};
export const DELETE: RequestHandler = async ({ request, cookies }) => {
	if (!sameOrigin(request))
		return respond({ error: 'Please sign out from this site.' }, 403);
	cookies.delete('jc_owner', { path: '/' });
	return respond({ owner: false });
};
