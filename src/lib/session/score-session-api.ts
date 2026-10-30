import { createOfflineScoreClient } from './offline-scoring';
import type { ScoreEvent } from '$lib/scorekeeper/engine';
import type { GuidedScoreProfile, ScoreInputMode, ScoreWinDirection } from '$lib/session/score-session-commands';

export interface SessionConfigPayload {
	players?: string[];
	scoreRulePack?: unknown;
	gameplayRulePack?: unknown;
	scoreModeId?: string;
	scoreInputMode?: ScoreInputMode;
	scoreWinDirection?: ScoreWinDirection;
	scoreRulesetId?: string;
	scoreGuidedProfile?: GuidedScoreProfile;
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
	requestId?: string;
	id: string;
	source: 'scorekeeper' | 'gameplay';
	createdAt: string;
	actorId?: string;
	sourcePayload: unknown;
	scoreEvent: ScoreEvent;
}

export interface SessionState {
 mahjong?:import('../gameplay/mahjong').MahjongProgress;
 rubber?:import('../gameplay/contract-scoring').RubberState;
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
	sync?: { status: 'synced' | 'offline' | 'conflict' | 'error'; pending: number; message?: string };
	sessionId: string;
	createdAt: string;
	updatedAt: string;
	eventCount: number;
	config: {
		scoreRulePack?: unknown;
		players?: string[];
		scoreModeId?: string;
		scoreInputMode?: ScoreInputMode;
		scoreWinDirection?: ScoreWinDirection;
		scoreRulesetId?: string;
		scoreGuidedProfile?: GuidedScoreProfile;
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
	if (typeof window !== 'undefined') return withDeviceLock('create', () => deviceClient().create(payload));
	return parseJson<SessionCreateResponse>(
		await fetch('/api/sessions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ config: payload })
		})
	);
}

export async function getSessionState(sessionId: string): Promise<SessionStateView> {
	if (typeof window !== 'undefined') return withDeviceLock(sessionId, () => deviceClient().get(sessionId));
	return parseJson<SessionStateView>(
		await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
			method: 'GET'
		})
	);
}

export async function postSessionEvent(sessionId: string, scoreEvent: ScoreEvent): Promise<SessionStateView> {
	if (typeof window !== 'undefined') return withDeviceLock(sessionId, () => deviceClient().post(sessionId, scoreEvent));
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

function deviceClient() { return createOfflineScoreClient(localStorage); }
// Web Locks serialize read/modify/write across browser tabs, including network retries.
async function withDeviceLock<T>(id: string, action: () => Promise<T>): Promise<T> {
 if (!navigator.locks) throw new Error('Offline scoring needs a current browser on HTTPS or localhost.');
 return navigator.locks.request(`jc-score-${id}`, action);
}
export function savedDeviceSessions(): SessionStateView[] { return deviceClient().list(); }
export async function forkOfflineSession(id: string): Promise<SessionStateView> {
 return withDeviceLock(id, () => deviceClient().fork(id));
}
