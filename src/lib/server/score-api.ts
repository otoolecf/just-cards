import {
	appendSessionEvent,
	buildSessionStateView,
	createSession,
	type SessionConfig,
	type SessionAppendInput,
	type SessionRepository
} from '../session/session-store';

export type ScoreRequest =
	| { type: 'create'; config: SessionConfig }
	| { type: 'get' }
	| { type: 'append'; input: SessionAppendInput };

export function handleScoreRequest(
	id: string,
	request: ScoreRequest,
	repository: SessionRepository
): Response {
	try {
		if (request.type === 'create') {
			const session = createSession(
				{ sessionId: id, config: request.config },
				repository
			);
			return Response.json(
				{
					sessionId: session.id,
					createdAt: session.createdAt,
					updatedAt: session.updatedAt
				},
				{ headers: { 'cache-control': 'no-store' } }
			);
		}
		if (request.type === 'append')
			appendSessionEvent(id, request.input, repository);
		return Response.json(buildSessionStateView(id, repository), {
			headers: { 'cache-control': 'no-store' }
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unable to update scores';
		return Response.json(
			{ error: message },
			{ status: /not found/i.test(message) ? 404 : /^Conflict:/.test(message) ? 409 : 400 }
		);
	}
}
