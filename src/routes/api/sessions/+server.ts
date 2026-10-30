import type { RequestHandler } from './$types';
import { dispatchScore } from '$lib/server/score-dispatch';
import type { SessionConfig } from '$lib/session/session-store';

export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
	const payload = (await request.json().catch(() => ({}))) as {
		sessionId?: string;
		config?: SessionConfig;
	};
	const sessionId = payload.sessionId ?? `sess-${crypto.randomUUID()}`;
	return dispatchScore(
		sessionId,
		{ type: 'create', config: payload.config ?? {} },
		platform, getClientAddress()
	);
};
