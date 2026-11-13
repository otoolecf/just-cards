import {
	appendSessionEvent,
	buildSessionStateView,
	createSession,
	type SessionConfig,
	type SessionAppendInput,
	type SessionRepository
} from '../session/session-store';

export type ScoreRequest = (
	| { type: 'create'; config: SessionConfig }
	| { type: 'get' }
	| { type: 'append'; input: SessionAppendInput }
	| { type: 'share' | 'claim' | 'release' }
) & { keeperHash?: string };

export const SCORE_KEEPER_TIMEOUT_MS = 60_000;

export function handleScoreRequest(
	id: string,
	request: ScoreRequest,
	repository: SessionRepository
): Response {
	try {
		let record = repository.get(id);
		const owns = Boolean(record?.shared?.keeperHash && record.shared.keeperHash === request.keeperHash);
		const forbidden = () => Response.json({ error: 'Only the current scorekeeper can edit this room.' }, { status: 403 });
		if (record?.shared && ['append', 'create', 'share', 'release'].includes(request.type) && !owns) return forbidden();
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
		if (!record) throw new Error('Score session not found');
		if (request.type === 'share' || request.type === 'claim') {
			if (!request.keeperHash) return forbidden();
			if (request.type === 'claim' && !owns && (!record.shared || (record.shared.keeperHash && Date.now() - record.shared.lastSeen < SCORE_KEEPER_TIMEOUT_MS))) {
				throw new Error('Conflict: the scorekeeper is still active. Ask them to hand off or wait for inactivity.');
			}
			record.shared = { keeperHash: request.keeperHash, lastSeen: Date.now() };
			repository.set(id, record);
		} else if (request.type === 'release') {
			if (!record.shared || !owns) return forbidden();
			record.shared = { keeperHash: '', lastSeen: 0 };
			repository.set(id, record);
		} else if (record.shared && owns) {
			if (request.type === 'append' && !Number.isInteger(request.input.expectedEventCount)) throw new Error('Conflict: refresh scores before editing.');
			record.shared.lastSeen = Date.now();
			repository.set(id, record);
		}
		if (request.type === 'append')
			appendSessionEvent(id, request.input, repository);
		record = repository.get(id)!;
		return Response.json({ ...buildSessionStateView(id, repository), ...(record.shared ? { shared: {
			isScorekeeper: Boolean(record.shared.keeperHash && record.shared.keeperHash === request.keeperHash),
			canTakeOver: !record.shared.keeperHash || Date.now() - record.shared.lastSeen >= SCORE_KEEPER_TIMEOUT_MS,
			lastSeen: record.shared.lastSeen
		} } : {}) }, {
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
