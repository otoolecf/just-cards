import type { Handle } from '@sveltejs/kit';
import { ownerAuthorized, protectedOwnerPath } from '$lib/server/owner-auth';
import { ownerKey } from '$lib/server/owner-config';
export const handle: Handle = async ({ event, resolve }) => {
	if (
		protectedOwnerPath(event.route.id ?? event.url.pathname, event.request.method) &&
		!(await ownerAuthorized(event.request, ownerKey(event.platform)))
	) {
		return Response.json(
			{
				error:
					'Owner sign-in is required for AI imports, assistant tools, and shared-library edits. Sign in at /owner.',
			},
			{ status: 403, headers: { 'cache-control': 'no-store' } },
		);
	}
	return resolve(event);
};
