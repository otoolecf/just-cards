import { dev } from '$app/environment';
import type { RuntimeRulesetBundle } from '../rulesets/types';
import { localRoomStorage } from './local-room-storage';
import { roomRequest } from './room-api';

export async function dispatchRoom(
	request: Request,
	code: string,
	platform: App.Platform | undefined,
	bundle?: RuntimeRulesetBundle
): Promise<Response> {
	if (!/^[A-Z0-9]{8}$/.test(code))
		return Response.json(
			{ error: 'Enter an eight-character room code' },
			{ status: 400 }
		);
	if (!dev && platform?.env.ROOMS) {
		return platform.env.ROOMS.getByName(code).handleRoom(
			code,
			{
				method: request.method,
				authorization: request.headers.get('authorization') ?? '',
				...(request.method !== 'GET' ? { body: await request.text() } : {})
			},
			bundle
		);
	}
	if (!dev) throw new Error('ROOMS binding is required');
	return roomRequest(request, code, await localRoomStorage(), bundle);
}
