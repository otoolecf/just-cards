import type { RequestHandler } from './$types';
import { dispatchRoom } from '$lib/server/room-dispatch';

const handle: RequestHandler = async ({ request, params, platform, getClientAddress }) =>
	dispatchRoom(request, params.code.toUpperCase(), platform, undefined, getClientAddress());
export const GET = handle;
export const POST = handle;
