import { deriveState, type ScoreEvent, type ScoreState } from '$lib/scorekeeper/engine';
import {
	adaptGameplayScoringToScoreEvent,
	type GameplayScoringCommand
} from '$lib/session/score-event-adapter';
import type { GuidedScoreProfile, ScoreInputMode, ScoreWinDirection } from '$lib/session/score-session-commands';

export interface SessionConfig {
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
	id: string;
	source: 'scorekeeper' | 'gameplay';
	createdAt: string;
	actorId?: string;
	scoreEvent: ScoreEvent;
	sourcePayload: unknown;
}

export interface AppendScoreInput {
	source: 'scorekeeper';
	actorId?: string;
	scoreEvent: ScoreEvent;
}

export interface AppendGameplayInput {
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
		scoreModeId?: string;
		scoreInputMode?: ScoreInputMode;
		scoreWinDirection?: ScoreWinDirection;
		scoreRulesetId?: string;
		scoreGuidedProfile?: GuidedScoreProfile;
		trace?: boolean;
	};
	state: ScoreState;
	events: Array<{
		id: string;
		source: 'scorekeeper' | 'gameplay';
		createdAt: string;
		actorId?: string;
		sourcePayload: unknown;
		scoreEvent: ScoreEvent;
	}>;
}

const sessions = new Map<string, SessionRecord>();

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
	return deriveState(events, record.config.scoreRulePack ?? {}, { trace });
}

export function createSession(input: SessionCreateInput): SessionRecord {
	const sessionId = input.sessionId ?? randomSessionId();
	if (sessions.has(sessionId)) {
		throw new Error(`Session "${sessionId}" already exists`);
	}

	const now = nowIso();
	const record: SessionRecord = {
		id: sessionId,
		createdAt: now,
		updatedAt: now,
		config: input.config,
		events: []
	};

	sessions.set(sessionId, record);
	return {
		...record,
		events: []
	};
}

export function getSession(sessionId: string): SessionRecord | undefined {
	return sessions.get(sessionId);
}

export function appendSessionEvent(sessionId: string, input: SessionAppendInput): SessionEvent {
	const session = sessions.get(sessionId);
	if (!session) {
		throw new Error(`Session "${sessionId}" not found`);
	}

	const scoreEvent = input.source === 'scorekeeper' ? input.scoreEvent : adaptGameplayScoringToScoreEvent(input.command);
	const sourcePayload = input.source === 'scorekeeper' ? input.scoreEvent : input.command;

	const event: SessionEvent = {
		id: randomSessionId(),
		source: input.source,
		createdAt: nowIso(),
		actorId: input.actorId,
		scoreEvent: cloneScoreEvent(scoreEvent),
		sourcePayload: cloneUnknown(sourcePayload)
	};

	session.events.push(event);
	session.updatedAt = event.createdAt;
	return event;
}

export function buildSessionStateView(sessionId: string): SessionStateView {
	const session = sessions.get(sessionId);
	if (!session) {
		throw new Error(`Session "${sessionId}" not found`);
	}

	const state = toSessionState(session, session.config.trace === true || false);
	const events = session.events.map((entry) => ({
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
