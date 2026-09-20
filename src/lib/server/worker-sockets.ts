import { parseRoomSocketRequest } from './room-socket';

/** Intercept upgrades before SvelteKit so its Response handling never buffers a socket. */
export function socketResponse(
	request: Request,
	env: Env
): Promise<Response> | Response | undefined {
	if (!new URL(request.url).pathname.endsWith('/socket')) return undefined;
	try {
		const { code } = parseRoomSocketRequest(request);
		return env.ROOMS.getByName(code).fetch(request);
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : 'Invalid socket request' },
			{ status: 400 }
		);
	}
}
