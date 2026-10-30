import { describe, expect, it, vi } from 'vitest';
import { createRulePack, type ScoreEvent } from '$lib/scorekeeper/engine';
import * as patterns from '$lib/gameplay/pattern-detector';
import { handleScoreRequest } from '$lib/server/score-api';
import {
	buildSessionStateView,
	type SessionRecord,
	type SessionStateView
} from './session-store';

describe('public score trace suppression', () => {
	it('returns ordinary scores without amplifying debug output on append or read', async () => {
		const repository = new Map<string, SessionRecord>();
		const config = {
			trace: true,
			scoreRulePack: createRulePack({
				modifiers: Array.from({ length: 40 }, (_, i) => ({
					id: `modifier-${i}-` + 'x'.repeat(240),
					when: { kind: 'is_ace' as const, value: true },
					operation: { kind: 'add' as const, value: 0 }
				}))
			})
		};
		expect(
			handleScoreRequest('trace-test', { type: 'create', config }, repository)
				.status
		).toBe(200);
		const scoreEvent: ScoreEvent = {
			type: 'add_round',
			entries: [
				{
					target: { kind: 'player', id: 'Alice' },
					cards: Array.from({ length: 100 }, () => ({ rank: 'A' }))
				}
			]
		};
		for (let i = 1; i <= 3; i++) {
			const response = handleScoreRequest(
				'trace-test',
				{ type: 'append', input: { source: 'scorekeeper', scoreEvent } },
				repository
			);
			expect(response.status).toBe(200);
			const text = await response.text();
			const view = JSON.parse(text) as SessionStateView;
			expect(view.state.totalsByPlayer).toEqual({ Alice: i * 100 });
			expect(view.state.trace).toBeUndefined();
			expect(view.config.trace).toBe(false);
			expect(text.length).toBeLessThan(50_000);
		}
		const before = structuredClone(repository.get('trace-test'));
		expect(before?.config.trace).toBe(true); // Legacy settings need no migration.
		const response = handleScoreRequest(
			'trace-test',
			{ type: 'get' },
			repository
		);
		const text = await response.text();
		expect(text.length).toBeLessThan(50_000);
		expect(
			buildSessionStateView('trace-test', repository).state.trace
		).toBeUndefined();
		expect(repository.get('trace-test')).toEqual(before);
	});

	it('does not enable detector traces from event-level match options during replay', () => {
		const repository = new Map<string, SessionRecord>();
		handleScoreRequest(
			'pattern-trace',
			{ type: 'create', config: { trace: true } },
			repository
		);
		const spy = vi.spyOn(patterns, 'detectPatterns');
		try {
			const scoreEvent: ScoreEvent = {
				type: 'add_pattern_round',
				matchOptions: { trace: true },
				patternPack: patterns.createPatternDetectorRulePack({
					patterns: [
						{
							id: 'pair',
							match: { kind: 'all_same_rank', minCards: 2, maxCards: 2 }
						}
					]
				}),
				patternScoring: [{ patternId: 'pair', points: 2 }],
				entries: [
					{
						target: { kind: 'player', id: 'Alice' },
						cards: [{ rank: 'A' }, { rank: 'A' }]
					}
				]
			};
			expect(
				handleScoreRequest(
					'pattern-trace',
					{ type: 'append', input: { source: 'scorekeeper', scoreEvent } },
					repository
				).status
			).toBe(200);
			const before = structuredClone(repository.get('pattern-trace'));
			const view = buildSessionStateView('pattern-trace', repository);
			expect(view.state.totalsByPlayer).toEqual({ Alice: 2 });
			expect(view.state.trace).toBeUndefined();
			expect(spy).toHaveBeenCalled();
			expect(
				spy.mock.calls.every(([, , options]) => options?.trace === false)
			).toBe(true);
			expect(repository.get('pattern-trace')).toEqual(before);
		} finally {
			spy.mockRestore();
		}
	});
});
