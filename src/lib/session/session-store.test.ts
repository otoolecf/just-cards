import { beforeEach, describe, expect, it } from 'vitest';

import { createRulePack, type ScoreEvent } from '$lib/scorekeeper/engine';
import { createPatternDetectorRulePack } from '$lib/gameplay/pattern-detector';
import { appendSessionEvent, createSession, buildSessionStateView, resetInMemorySessionsForTests } from './session-store';

describe('session store', () => {
	beforeEach(() => {
		resetInMemorySessionsForTests();
	});

	it('creates a session and derives scores from direct scorekeeper events', () => {
		const session = createSession({ config: { scoreRulePack: createRulePack() } });
		const event: ScoreEvent = {
			type: 'add_round',
			playerCards: {
				alice: [{ rank: '2' }, { rank: 'K' }],
				bob: [{ rank: 'A' }]
			}
		};

		appendSessionEvent(session.id, { source: 'scorekeeper', scoreEvent: event });

		const view = buildSessionStateView(session.id);

		expect(view.eventCount).toBe(1);
		expect(view.state.totalsByPlayer).toEqual({
			alice: 15,
			bob: 1
		});
		expect(view.events[0].source).toBe('scorekeeper');
	});

	it('adapts gameplay scoring commands into card-value score events', () => {
		const session = createSession({ config: { scoreRulePack: createRulePack() } });

		appendSessionEvent(session.id, {
			source: 'gameplay',
			command: {
				type: 'score_round',
				entries: [
					{
						target: { kind: 'player', id: 'alice' },
						cards: [{ rank: 'Q' }, { rank: 'J' }]
					},
					{
						target: { kind: 'player', id: 'bob' },
						cards: [{ rank: '2' }]
					}
				]
			}
		});

		const view = buildSessionStateView(session.id);

		expect(view.state.totalsByPlayer).toEqual({
			alice: 23,
			bob: 2
		});
		expect(view.events[0].source).toBe('gameplay');
	});

	it('adapts gameplay pattern commands into pattern score events', () => {
		const session = createSession({ config: { scoreRulePack: createRulePack() } });
		const patternPack = createPatternDetectorRulePack({
			patterns: [
				{
					id: 'pair',
					match: { kind: 'all_same_rank', minCards: 2, maxCards: 2 },
					maxMatches: 1
				}
			]
		});

		appendSessionEvent(session.id, {
			source: 'gameplay',
			command: {
				type: 'score_patterns',
				entries: [{ target: { kind: 'player', id: 'alice' }, cards: [{ rank: '7' }, { rank: '7' }, { rank: 'K' }] }],
				patternPack,
				patternScoring: [{ patternId: 'pair', points: 5 }]
			}
		});

		const view = buildSessionStateView(session.id);
		expect(view.state.totalsByPlayer.alice).toBe(5);
		expect(view.state.validationIssues).toBeUndefined();
	});

	it('supports undo replay through event log derivation', () => {
		const session = createSession({ config: { scoreRulePack: createRulePack() } });

		appendSessionEvent(session.id, {
			source: 'scorekeeper',
			scoreEvent: {
				type: 'add_round',
				playerCards: {
					alice: [{ rank: 'A' }],
					bob: [{ rank: 'A' }]
				}
			}
		});
		appendSessionEvent(session.id, {
			source: 'scorekeeper',
			scoreEvent: {
				type: 'add_round',
				playerCards: {
					alice: [{ rank: 'K' }]
				}
			}
		});
		appendSessionEvent(session.id, {
			source: 'scorekeeper',
			scoreEvent: {
				type: 'undo'
			}
		});

		const view = buildSessionStateView(session.id);

		expect(view.state.totalsByPlayer.alice).toBe(1);
		expect(view.state.totalsByPlayer.bob).toBe(1);
	});

	it('throws when appending to or reading missing session', () => {
		expect(() => appendSessionEvent('missing', { source: 'scorekeeper', scoreEvent: { type: 'undo' } })).toThrow(
			'Session "missing" not found'
		);
		expect(() => buildSessionStateView('missing')).toThrow('Session "missing" not found');
	});
});
