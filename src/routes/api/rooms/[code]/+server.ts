import type { RequestHandler } from './$types';
import { dispatchRoom } from '$lib/server/room-dispatch';

const handle: RequestHandler = async ({ request, params, platform }) =>
	dispatchRoom(request, params.code.toUpperCase(), platform);
export const GET = handle;
export const POST = handle;
