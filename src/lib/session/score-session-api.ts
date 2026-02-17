import type { ScoreEvent } from '$lib/scorekeeper/engine';

export interface SessionConfigPayload {
	scoreRulePack?: unknown;
	gameplayRulePack?: unknown;
	scoreModeId?: string;
	trace?: boolean;
}

export interface SessionCreateResponse {
	sessionId: string;
	createdAt: string;
	updatedAt: string;
}

export interface SessionStateValidationIssue {
	code: string;
	message: string;
}

export interface SessionEventRecord {
	id: string;
	source: 'scorekeeper' | 'gameplay';
	createdAt: string;
	actorId?: string;
	sourcePayload: unknown;
	scoreEvent: ScoreEvent;
}

export interface SessionState {
	totalsByTarget: Record<string, number>;
	totalsByPlayer: Record<string, number>;
	validationIssues?: SessionStateValidationIssue[];
	trace?: Array<{
		eventIndex: number;
		stage: 'validate' | 'detect' | 'score' | 'route' | 'settle';
		message: string;
		data?: Record<string, unknown>;
	}>;
}

export interface SessionStateView {
	sessionId: string;
	createdAt: string;
	updatedAt: string;
	eventCount: number;
	config: {
		scoreModeId?: string;
		trace?: boolean;
	};
	state: SessionState;
	events: SessionEventRecord[];
}

interface ApiErrorResponse {
	error?: string;
}

async function parseJson<T>(response: Response): Promise<T> {
	let payload: unknown = null;
	try {
		payload = await response.json();
	} catch {
		payload = null;
	}

	if (!response.ok) {
		const message =
			(payload && typeof payload === 'object' && 'error' in payload && typeof (payload as ApiErrorResponse).error === 'string')
				? (payload as ApiErrorResponse).error
				: `Request failed with ${response.status} ${response.statusText}`;
		throw new Error(message);
	}

	if (!payload || typeof payload !== 'object') {
		throw new Error('Invalid server response');
	}

	return payload as T;
}

export async function createSession(payload: SessionConfigPayload = {}): Promise<SessionCreateResponse> {
	return parseJson<SessionCreateResponse>(
		await fetch('/api/sessions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ config: payload })
		})
	);
}

export async function getSessionState(sessionId: string): Promise<SessionStateView> {
	return parseJson<SessionStateView>(
		await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
			method: 'GET'
		})
	);
}

export async function postSessionEvent(sessionId: string, scoreEvent: ScoreEvent): Promise<SessionStateView> {
	return parseJson<SessionStateView>(
		await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ scoreEvent })
		})
	);
}

export async function safePollSessionState(sessionId: string): Promise<SessionStateView | null> {
	try {
		return await getSessionState(sessionId);
	} catch {
		return null;
	}
}
