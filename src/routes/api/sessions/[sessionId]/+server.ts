import { appendSessionEvent, buildSessionStateView, getSession } from '$lib/session/session-store';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { GameplayScoringCommand } from '$lib/session/score-event-adapter';
import type { ScoreEvent } from '$lib/scorekeeper/engine';
import type { AppendGameplayInput, AppendScoreInput, SessionAppendInput } from '$lib/session/session-store';

type AppendPayload = {
	source?: 'scorekeeper' | 'gameplay';
	actorId?: string;
	scoreEvent?: ScoreEvent;
	command?: GameplayScoringCommand;
};

const INVALID_SESSION = 'Session not found';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const sessionId = params.sessionId;
		if (!sessionId) {
			return json({ error: 'sessionId is required' }, { status: 400 });
		}

		const view = buildSessionStateView(sessionId);
		return json(view);
	} catch (error) {
		const message = error instanceof Error ? error.message : INVALID_SESSION;
		if (message.includes('not found')) {
			return json({ error: INVALID_SESSION }, { status: 404 });
		}

		return json({ error: message }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	const sessionId = params.sessionId;
	if (!sessionId) {
		return json({ error: 'sessionId is required' }, { status: 400 });
	}

	const sessionExists = getSession(sessionId);
	if (!sessionExists) {
		return json({ error: INVALID_SESSION }, { status: 404 });
	}

	try {
		const body = (await request.json().catch(() => ({}))) as AppendPayload;

		let appendInput: SessionAppendInput;
		if (body.source === 'gameplay' && body.command) {
			appendInput = {
				source: 'gameplay',
				actorId: body.actorId,
				command: body.command
			} as AppendGameplayInput;
		} else if (body.scoreEvent) {
			appendInput = {
				source: 'scorekeeper',
				actorId: body.actorId,
				scoreEvent: body.scoreEvent
			} as AppendScoreInput;
		} else {
			return json({ error: 'Invalid event payload' }, { status: 400 });
		}

		appendSessionEvent(sessionId, appendInput);

		return json(buildSessionStateView(sessionId));
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to append event';
		return json({ error: message }, { status: 400 });
	}
};
