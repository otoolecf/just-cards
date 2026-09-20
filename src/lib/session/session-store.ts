import { createRulePack, deriveState, type ScoreEvent, type ScoreState } from '$lib/scorekeeper/engine';
import {
	adaptGameplayScoringToScoreEvent,
	type GameplayScoringCommand
} from '$lib/session/score-event-adapter';
import type { GuidedScoreProfile, ScoreInputMode, ScoreWinDirection } from '$lib/session/score-session-commands';

export interface SessionConfig {
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

export interface SessionCreateInput {
	sessionId?: string;
	config: SessionConfig;
}

export interface SessionRecord {
	id: string;
	createdAt: string;
	updatedAt: string;
	config: SessionConfig;
	events: SessionEvent[];
}

interface SessionEvent {
	requestId?: string;
	id: string;
	source: 'scorekeeper' | 'gameplay';
	createdAt: string;
	actorId?: string;
	scoreEvent: ScoreEvent;
	sourcePayload: unknown;
}

export interface AppendScoreInput {
	requestId?: string;
	expectedEventCount?: number;
	source: 'scorekeeper';
	actorId?: string;
	scoreEvent: ScoreEvent;
}

export interface AppendGameplayInput {
	requestId?: string;
	expectedEventCount?: number;
	source: 'gameplay';
	actorId?: string;
	command: GameplayScoringCommand;
}

export type SessionAppendInput = AppendScoreInput | AppendGameplayInput;

export interface SessionStateView {
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
	state: ScoreState;
	events: Array<{
		requestId?: string;
		id: string;
		source: 'scorekeeper' | 'gameplay';
		createdAt: string;
		actorId?: string;
		sourcePayload: unknown;
		scoreEvent: ScoreEvent;
	}>;
}

const sessions = new Map<string, SessionRecord>();

export interface SessionRepository {
	has(id: string): boolean;
	get(id: string): SessionRecord | undefined;
	set(id: string, record: SessionRecord): void;
}

function nowIso(): string {
	return new Date().toISOString();
}

function randomSessionId(): string {
	return `sess-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function cloneUnknown(value: unknown): unknown {
	return value;
}

function cloneScoreEvent(scoreEvent: ScoreEvent): ScoreEvent {
	return structuredClone(scoreEvent);
}

function toSessionState(record: SessionRecord, trace = false): ScoreState {
	const events = record.events.map((entry) => entry.scoreEvent);
	return deriveState(events, record.config.scoreRulePack ?? createRulePack(), { trace });
}

export function createSession(input: SessionCreateInput, repository: SessionRepository = sessions): SessionRecord {
	const sessionId = input.sessionId ?? randomSessionId();
	if (repository.has(sessionId)) {
		const existing = repository.get(sessionId)!;
		if (JSON.stringify(existing.config) === JSON.stringify(input.config)) return structuredClone(existing);
		throw new Error('Conflict: session identifier already has different settings');
	}

	const now = nowIso();
	const record: SessionRecord = {
		id: sessionId,
		createdAt: now,
		updatedAt: now,
		config: structuredClone(input.config),
		events: []
	};

	toSessionState(record);
	repository.set(sessionId, record);
	return {
		...record,
		events: []
	};
}

export function getSession(sessionId: string, repository: SessionRepository = sessions): SessionRecord | undefined {
	return repository.get(sessionId);
}

export function appendSessionEvent(sessionId: string, input: SessionAppendInput, repository: SessionRepository = sessions): SessionEvent {
	const stored = repository.get(sessionId);
	if (!stored) {
		throw new Error(`Session "${sessionId}" not found`);
	}
	if (input.requestId !== undefined) {
		if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(input.requestId)) throw new Error('Invalid request identifier');
		const previous = stored.events.find(e => e.requestId === input.requestId);
		if (previous) {
			const payload = input.source === 'scorekeeper' ? input.scoreEvent : input.command;
			if (previous.source !== input.source || previous.actorId !== input.actorId || JSON.stringify(previous.sourcePayload) !== JSON.stringify(payload)) throw new Error('Conflict: request identifier reused for different scores');
			return structuredClone(previous);
		}
	}
	if (input.expectedEventCount !== undefined && (!Number.isInteger(input.expectedEventCount) || input.expectedEventCount !== stored.events.length)) throw new Error('Conflict: scores changed on another device');
	const session = structuredClone(stored);

	const scoreEvent = input.source === 'scorekeeper' ? input.scoreEvent : adaptGameplayScoringToScoreEvent(input.command);
	if (!scoreEvent || !['add_contract', 'add_round', 'add_pattern_round', 'add_delta', 'settle_pool', 'undo', 'redo'].includes(scoreEvent.type)) {
		throw new Error('Invalid score event');
	}
	if(scoreEvent.type==='add_contract' && (session.config.scoreGuidedProfile?.roundScoring!=='contract' || JSON.stringify(scoreEvent.players)!==JSON.stringify(session.config.players))) throw new Error('Contract scoring requires the configured Bridge partnership seats');
	const sourcePayload = input.source === 'scorekeeper' ? input.scoreEvent : input.command;

	const event: SessionEvent = {
		...(input.requestId ? { requestId: input.requestId } : {}),
		id: randomSessionId(),
		source: input.source,
		createdAt: nowIso(),
		actorId: input.actorId,
		scoreEvent: cloneScoreEvent(scoreEvent),
		sourcePayload: cloneUnknown(sourcePayload)
	};

	session.events.push(event);
	session.updatedAt = event.createdAt;
	// Validate replay before replacing the durable log (or mutating the in-memory adapter).
	const derived = toSessionState(session);
	if (Object.values(derived.totalsByTarget).some(total => !Number.isFinite(total))) {
		throw new Error('Score totals must be finite numbers');
	}
	repository.set(sessionId, session);
	return event;
}

export function buildSessionStateView(sessionId: string, repository: SessionRepository = sessions): SessionStateView {
	const session = repository.get(sessionId);
	if (!session) {
		throw new Error(`Session "${sessionId}" not found`);
	}

	const state = toSessionState(session, session.config.trace === true || false);
	const events = session.events.map((entry) => ({
		...(entry.requestId ? { requestId: entry.requestId } : {}),
		id: entry.id,
		source: entry.source,
		createdAt: entry.createdAt,
		actorId: entry.actorId,
		sourcePayload: entry.sourcePayload,
		scoreEvent: cloneScoreEvent(entry.scoreEvent)
	}));

	return {
		sessionId: session.id,
		createdAt: session.createdAt,
		updatedAt: session.updatedAt,
		eventCount: session.events.length,
		config: {
			scoreRulePack: session.config.scoreRulePack,
			players: session.config.players ? [...session.config.players] : undefined,
			scoreModeId: session.config.scoreModeId,
			scoreInputMode: session.config.scoreInputMode,
			scoreWinDirection: session.config.scoreWinDirection,
			scoreRulesetId: session.config.scoreRulesetId,
			scoreGuidedProfile: session.config.scoreGuidedProfile
				? structuredClone(session.config.scoreGuidedProfile)
				: undefined,
			trace: session.config.trace
		},
		state,
		events
	};
}

export function resetInMemorySessionsForTests(): void {
	sessions.clear();
}
