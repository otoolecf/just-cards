import type { RequestHandler } from './$types';
import { dispatchScore } from '$lib/server/score-dispatch';
import type { SessionAppendInput } from '$lib/session/session-store';
import type { GameplayScoringCommand } from '$lib/session/score-event-adapter';
import type { ScoreEvent } from '$lib/scorekeeper/engine';

export const GET: RequestHandler = ({ params, platform, getClientAddress, request }) =>
	dispatchScore(params.sessionId, { type: 'get' }, platform, getClientAddress(), request.headers.get('authorization') ?? '');
export const POST: RequestHandler = async ({ params, request, platform, getClientAddress }) => {
	const body = (await request.json().catch(() => ({}))) as {
		action?: string;
		requestId?: string;
		expectedEventCount?: number;
		source?: string;
		actorId?: string;
		scoreEvent?: ScoreEvent;
		command?: GameplayScoringCommand;
	};
	if (body.action && ['share','claim','release'].includes(body.action)) return dispatchScore(params.sessionId, {type:body.action as 'share'|'claim'|'release'}, platform, getClientAddress(), request.headers.get('authorization') ?? '');
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
	return dispatchScore(params.sessionId, { type: 'append', input }, platform, getClientAddress(), request.headers.get('authorization') ?? '');
};
