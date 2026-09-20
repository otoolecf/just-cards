import { expect, it } from 'vitest';
import {
	createSession,
	appendSessionEvent,
	buildSessionStateView,
	type SessionRepository,
	type SessionRecord
} from './session-store';
import type { ScoreEvent } from '../scorekeeper/engine';

it('does not persist a malformed score that would make future reloads fail', () => {
	const repository = new Map<string, SessionRecord>();
	createSession({ sessionId: 'safe-log', config: {} }, repository);
	expect(() => appendSessionEvent('safe-log', {
		source: 'scorekeeper', scoreEvent: { type: 'add_delta', entries: [null] } as unknown as ScoreEvent
	}, repository)).toThrow();
	expect(buildSessionStateView('safe-log', repository).eventCount).toBe(0);
	expect(() => appendSessionEvent('safe-log', {
		source: 'scorekeeper', scoreEvent: { type: 'typo' } as unknown as ScoreEvent
	}, repository)).toThrow();
});

it('rehydrates roster and event-derived scores from a serializable repository', () => {
	const rows = new Map<string, string>();
	const connect = (): SessionRepository => ({
		has: (id) => rows.has(id),
		get: (id) => {
			const row = rows.get(id);
			return row ? (JSON.parse(row) as SessionRecord) : undefined;
		},
		set: (id, record) => {
			rows.set(id, JSON.stringify(record));
		}
	});
	const store = connect();
	createSession(
		{ sessionId: 'family', config: { players: ['Parent', 'Child'] } },
		store
	);
	expect(buildSessionStateView('family', connect()).config.players).toEqual([
		'Parent',
		'Child'
	]);
	appendSessionEvent(
		'family',
		{
			source: 'scorekeeper',
			scoreEvent: {
				type: 'add_delta',
				entries: [{ target: { kind: 'player', id: 'Parent' }, delta: -2 }]
			}
		},
		store
	);
	expect(
		buildSessionStateView('family', connect()).state.totalsByPlayer.Parent
	).toBe(-2);
	appendSessionEvent(
		'family',
		{ source: 'scorekeeper', scoreEvent: { type: 'undo' } },
		connect()
	);
	expect(
		buildSessionStateView('family', connect()).state.totalsByPlayer.Parent ?? 0
	).toBe(0);
	appendSessionEvent(
		'family',
		{ source: 'scorekeeper', scoreEvent: { type: 'redo' } },
		connect()
	);
	expect(
		buildSessionStateView('family', connect()).state.totalsByPlayer.Parent
	).toBe(-2);
});
