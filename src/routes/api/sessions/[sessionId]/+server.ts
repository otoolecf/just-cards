import type { RequestHandler } from './$types';
import { dispatchScore } from '$lib/server/score-dispatch';
import type { SessionAppendInput } from '$lib/session/session-store';
import type { GameplayScoringCommand } from '$lib/session/score-event-adapter';
import type { ScoreEvent } from '$lib/scorekeeper/engine';

export const GET: RequestHandler = ({ params, platform }) =>
	dispatchScore(params.sessionId, { type: 'get' }, platform);
export const POST: RequestHandler = async ({ params, request, platform }) => {
	const body = (await request.json().catch(() => ({}))) as {
		requestId?: string;
		expectedEventCount?: number;
		source?: string;
		actorId?: string;
		scoreEvent?: ScoreEvent;
		command?: GameplayScoringCommand;
	};
	let input: SessionAppendInput;
	if (body.source === 'gameplay' && body.command)
		input = {
			source: 'gameplay',
			requestId: body.requestId,
			expectedEventCount: body.expectedEventCount,
			actorId: body.actorId,
			command: body.command
		};
	else if (body.scoreEvent)
		input = {
			source: 'scorekeeper',
			requestId: body.requestId,
			expectedEventCount: body.expectedEventCount,
			actorId: body.actorId,
			scoreEvent: body.scoreEvent
		};
	else
		return Response.json({ error: 'Invalid event payload' }, { status: 400 });
	return dispatchScore(params.sessionId, { type: 'append', input }, platform);
};
