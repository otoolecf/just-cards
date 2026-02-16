import { createSession } from '$lib/session/session-store';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface CreateSessionPayload {
	config?: {
		scoreRulePack?: unknown;
		gameplayRulePack?: unknown;
		trace?: boolean;
	};
	sessionId?: string;
}

export const POST: RequestHandler = async ({ request }) => {
	const payload = (await request.json().catch(() => ({}))) as CreateSessionPayload;
	try {
		const session = createSession({
			sessionId: payload.sessionId,
			config: payload.config ?? {}
		});

		return json({ sessionId: session.id, createdAt: session.createdAt, updatedAt: session.updatedAt });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to create session';
		return json({ error: message }, { status: 400 });
	}
};
