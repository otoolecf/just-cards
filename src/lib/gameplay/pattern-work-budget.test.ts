import { describe, expect, it } from 'vitest';
import {
	createPatternDetectorRulePack,
	detectPatterns,
	type PatternMatchKind
} from './pattern-detector';
import {
	createRulePack,
	deriveState,
	type ScoreEvent
} from '$lib/scorekeeper/engine';
import {
	appendSessionEvent,
	buildSessionStateView,
	createSession,
	type SessionRecord
} from '$lib/session/session-store';
import { handleScoreRequest } from '$lib/server/score-api';

const cards = (count: number) =>
	Array.from({ length: count }, () => ({ rank: 'A' as const }));
const pack = (
	match: PatternMatchKind = { kind: 'all_same_rank', minCards: 1 }
) =>
	createPatternDetectorRulePack({
		patterns: [{ id: 'sets', match, maxMatches: 1 }]
	});
const event = (count = 8, entries = 1): ScoreEvent => ({
	type: 'add_pattern_round',
	patternPack: pack(),
	patternScoring: [{ patternId: 'sets', points: 2 }],
	entries: Array.from({ length: entries }, () => ({
		target: { kind: 'player', id: 'Alice' },
		cards: cards(count)
	}))
});

describe('runtime pattern work protection', () => {
	it('short-circuits the reported empty-first-child exploit', () => {
		const result = detectPatterns(
			cards(13),
			pack({
				kind: 'all',
				matches: [
					{ kind: 'all_same_rank', minCards: 14 },
					...Array.from({ length: 30 }, (): PatternMatchKind => ({
						kind: 'all_same_rank',
						minCards: 1
					}))
				]
			}),
			{ trace: true }
		);
		expect(result.matches).toEqual([]);
		expect(
			result.trace?.filter((entry) => entry.stage === 'match')
		).toHaveLength(2);
	});

	it('bounds actual enumeration even with an accepted estimate and maxMatches=1', () => {
		expect(() => detectPatterns(cards(13), pack())).toThrow(
			/too complex|work budget/i
		);
	});

	it('bounds nested children even when a later empty child zeros the estimate', () => {
		expect(() =>
			detectPatterns(
				cards(13),
				pack({
					kind: 'all',
					matches: [
						{ kind: 'any', matches: [{ kind: 'all_same_rank', minCards: 1 }] },
						{ kind: 'card_count', min: 14 }
					]
				})
			)
		).toThrow(/too complex|work budget/i);
	});

	it('bounds combination attempts even when overlap rejection and output caps discard results', () => {
		const composed = pack({
			kind: 'all',
			matches: Array.from({ length: 3 }, (): PatternMatchKind => ({
				kind: 'all_same_rank',
				minCards: 1,
				maxCards: 1
			}))
		});
		composed.patterns[0].maxMatches = 0;
		expect(() =>
			detectPatterns(cards(20), composed, { disallowOverlap: true })
		).toThrow(/too complex|work budget/i);
	});

	it('shares the detection budget across separate pattern rules', () => {
		const multiple = pack();
		multiple.patterns = Array.from({ length: 4 }, (_, i) => ({
			...multiple.patterns[0],
			id: `rule-${i}`
		}));
		expect(() => detectPatterns(cards(8), multiple)).toThrow(
			/too complex|work budget/i
		);
	});

	it('shares the event budget across scoring entries and leaves rejected appends unsaved', () => {
		expect(deriveState([event()], createRulePack()).totalsByPlayer).toEqual({
			Alice: 2
		});
		const repository = new Map<string, SessionRecord>();
		createSession({ sessionId: 'budget-test', config: {} }, repository);
		const before = structuredClone(repository.get('budget-test'));
		expect(() =>
			appendSessionEvent(
				'budget-test',
				{ source: 'scorekeeper', scoreEvent: event(8, 8) },
				repository
			)
		).toThrow(/too complex|work budget/i);
		expect(repository.get('budget-test')).toEqual(before);
	});

	it('bounds cumulative replay and returns a controlled error for legacy history', async () => {
		const repository = new Map<string, SessionRecord>();
		const record = createSession(
			{ sessionId: 'legacy', config: {} },
			repository
		);
		record.events = Array.from({ length: 100 }, (_, i) => ({
			id: `event-${i}`,
			source: 'scorekeeper',
			createdAt: record.createdAt,
			scoreEvent: event(),
			sourcePayload: event()
		}));
		repository.set('legacy', record);
		expect(() => buildSessionStateView('legacy', repository)).toThrow(
			/too complex|work budget/i
		);
		const response = handleScoreRequest('legacy', { type: 'get' }, repository);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: expect.stringMatching(/too complex|work budget/i)
		});
		expect(repository.get('legacy')?.events).toHaveLength(100);
	});

	it('rejects the append that exhausts replay without corrupting a readable session', async () => {
		const repository = new Map<string, SessionRecord>();
		createSession({ sessionId: 'growing', config: {} }, repository);
		let rejected = false;
		for (let i = 0; i < 100; i++) {
			const before = structuredClone(repository.get('growing'));
			const response = handleScoreRequest(
				'growing',
				{
					type: 'append',
					input: { source: 'scorekeeper', scoreEvent: event() }
				},
				repository
			);
			if (response.status === 400) {
				expect(await response.json()).toEqual({
					error: expect.stringMatching(/too complex|work budget/i)
				});
				expect(repository.get('growing')).toEqual(before);
				expect(
					buildSessionStateView('growing', repository).state.totalsByPlayer
				).toEqual({ Alice: i * 2 });
				rejected = true;
				break;
			}
			expect(response.status).toBe(200);
		}
		expect(rejected).toBe(true);
	});

	it('does not accept a budget override in user-supplied JSON options', () => {
		const attempted = event(13);
		if (attempted.type !== 'add_pattern_round') throw new Error('fixture');
		attempted.matchOptions = JSON.parse(
			'{"workBudget":1000000000,"remaining":1000000000,"maxMatchesPerRule":0}'
		);
		expect(() => deriveState([attempted], createRulePack())).toThrow(
			/too complex|work budget/i
		);
	});

	it('allows undo to recover legacy expensive work and rejects restoring it with redo', async () => {
		const repository = new Map<string, SessionRecord>();
		const record = createSession(
			{ sessionId: 'recover', config: {} },
			repository
		);
		record.events.push({
			id: 'old-expensive',
			source: 'scorekeeper',
			createdAt: record.createdAt,
			scoreEvent: event(13),
			sourcePayload: event(13)
		});
		repository.set('recover', record);
		expect(
			handleScoreRequest('recover', { type: 'get' }, repository).status
		).toBe(400);
		const recovered = handleScoreRequest(
			'recover',
			{
				type: 'append',
				input: { source: 'scorekeeper', scoreEvent: { type: 'undo' } }
			},
			repository
		);
		expect(recovered.status).toBe(200);
		expect(await recovered.json()).toEqual(
			expect.objectContaining({
				state: expect.objectContaining({ totalsByPlayer: {} })
			})
		);
		const before = structuredClone(repository.get('recover'));
		const redo = handleScoreRequest(
			'recover',
			{
				type: 'append',
				input: { source: 'scorekeeper', scoreEvent: { type: 'redo' } }
			},
			repository
		);
		expect(redo.status).toBe(400);
		expect(repository.get('recover')).toEqual(before);
	});

	it('preserves normal pattern scores, undo and redo with a fresh budget per replay', () => {
		const events: ScoreEvent[] = [event(3), event(3), { type: 'undo' }];
		expect(deriveState(events, createRulePack()).totalsByPlayer).toEqual({
			Alice: 2
		});
		events.push({ type: 'redo' });
		for (let i = 0; i < 3; i++) {
			expect(deriveState(events, createRulePack()).totalsByPlayer).toEqual({
				Alice: 4
			});
		}
	});
});
