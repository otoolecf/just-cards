import { createSession } from '$lib/session/session-store';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { GuidedScoreProfile } from '$lib/session/score-session-commands';

interface CreateSessionPayload {
	config?: {
		scoreRulePack?: unknown;
		gameplayRulePack?: unknown;
		scoreModeId?: string;
		scoreInputMode?: 'guided' | 'raw';
		scoreWinDirection?: 'high_wins' | 'low_wins';
		scoreRulesetId?: string;
		scoreGuidedProfile?: GuidedScoreProfile;
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
