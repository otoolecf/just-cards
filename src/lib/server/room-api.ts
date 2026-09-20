import {
	createRoom,
	credentialHash,
	updateRoom,
	viewRoom,
	type RoomMutation,
} from './room-service';
import type { RoomStorage } from './room-storage';
import type { RuntimeRulesetBundle } from '../rulesets/types';

export const roomHeaders = {
	'cache-control': 'no-store',
	'content-type': 'application/json',
};
export function roomError(error: unknown): Response {
	const message =
		error instanceof Error ? error.message : 'Unable to update room';
	return Response.json(
		{ error: message },
		{
			status: /not found/i.test(message)
				? 404
				: /table changed/i.test(message)
					? 409
					: 400,
			headers: roomHeaders,
		},
	);
}
export async function roomRequest(
	request: Request,
	code: string,
	storage: RoomStorage,
	bundle?: RuntimeRulesetBundle,
): Promise<Response> {
	try {
		const token =
			request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
		const hash = await credentialHash(token);
		if (request.method === 'GET') {
			const room = storage.read(code);
			if (!room) throw new Error('Room not found');
			return Response.json(viewRoom(room, hash), { headers: roomHeaders });
		}
		const raw = await request.text();
		if (raw.length > 16000) throw new Error('Room request is too large');
		const input = JSON.parse(raw);
		if (input.type === 'issue_recovery' || input.type === 'recover') {
			input.recoveryHash = await credentialHash(input.recoveryToken ?? '');
			delete input.recoveryToken;
		}
		const room = storage.write(code, (previous) => {
			if (bundle) {
				if (previous) throw new Error('Room code is already in use');
				return createRoom(code, input.name, hash, bundle);
			}
			if (!previous) throw new Error('Room not found');
			return updateRoom(previous, input as RoomMutation, hash);
		});
		return Response.json(viewRoom(room, hash), { headers: roomHeaders });
	} catch (error) {
		return roomError(error);
	}
}
