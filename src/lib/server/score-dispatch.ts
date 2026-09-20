import { dev } from '$app/environment';
import { localScoreStorage } from './local-score-storage';
import { handleScoreRequest, type ScoreRequest } from './score-api';

export async function dispatchScore(
	id: string,
	input: ScoreRequest,
	platform: App.Platform | undefined
): Promise<Response> {
	if (!id || id.length > 100)
		return Response.json({ error: 'Invalid session id' }, { status: 400 });
	if (!dev && platform?.env.ROOMS)
		return platform.env.ROOMS.getByName(`score-${id}`).handleScore(id, input);
	if (!dev) throw new Error('ROOMS binding is required');
	return handleScoreRequest(id, input, await localScoreStorage());
}
