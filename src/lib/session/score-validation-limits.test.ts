import { describe, expect, it, vi } from 'vitest';
import {
	createRulePack,
	deriveState,
	validateRulePack,
	type ScoreEvent
} from '$lib/scorekeeper/engine';
import * as detector from '$lib/gameplay/pattern-detector';
import { handleScoreRequest } from '$lib/server/score-api';
import { createSession, type SessionRecord } from './session-store';

function pattern(
	id = 'sets',
	mapped = false,
	count = 8
): Extract<ScoreEvent, { type: 'add_pattern_round' }> {
	return {
		type: 'add_pattern_round',
		patternPack: detector.createPatternDetectorRulePack({
			patterns: [{ id, match: { kind: 'all_same_rank', minCards: 1 } }]
		}),
		patternScoring: mapped ? [{ patternId: id, points: 0 }] : [],
		entries: [
			{
				target: { kind: 'player', id: 'Alice' },
				cards: Array.from({ length: count }, () => ({ rank: 'A' }))
			}
		]
	};
}

describe('bounded score validation', () => {
	it('rejects the amplification payload without persisting it', async () => {
		const repository = new Map<string, SessionRecord>();
		createSession({ sessionId: 'invalid', config: {} }, repository);
		const before = structuredClone(repository.get('invalid'));
		const response = handleScoreRequest(
			'invalid',
			{
				type: 'append',
				input: {
					source: 'scorekeeper',
					scoreEvent: pattern('audit-' + 'x'.repeat(8000))
				}
			},
			repository
		);
		expect(response.status).toBe(400);
		expect((await response.text()).length).toBeLessThan(1024);
		expect(repository.get('invalid')).toEqual(before);
	});
	it('rejects missing mappings before enumerating cards', () => {
		const spy = vi.spyOn(detector, 'detectPatterns');
		try {
			expect(() =>
				deriveState([pattern('sets', false, 30)], createRulePack(), {
					strictValidation: true
				})
			).toThrow(/unmapped_pattern/);
			expect(spy).not.toHaveBeenCalled();
		} finally {
			spy.mockRestore();
		}
	});
	it('deduplicates unmapped diagnostics across matches, entries and events', () => {
		const event = pattern();
		event.entries.push(...structuredClone(event.entries));
		const state = deriveState([event, event, event], createRulePack());
		expect(state.validationIssues).toHaveLength(1);
		expect(state.validationIssues?.[0].code).toBe('pattern:unmapped_pattern');
	});
	it('bounds diagnostic counts and messages while validating malformed rule packs', () => {
		const invalid = {
			...createRulePack(),
			...Object.fromEntries(
				Array.from({ length: 100 }, (_, i) => [
					`bad-${i}-` + 'x'.repeat(1000),
					true
				])
			)
		};
		const issues = validateRulePack(invalid);
		expect(issues.length).toBeLessThanOrEqual(32);
		expect(
			issues.every(
				(issue) => issue.message.length <= 256 && issue.code.length <= 64
			)
		).toBe(true);
		expect(issues.some((issue) => issue.code === 'diagnostics_truncated')).toBe(
			true
		);
	});
	it.each([
		'long_id',
		'duplicate_id',
		'long_mapping',
		'duplicate_mapping',
		'nan_points',
		'string_points',
		'too_many_mappings'
	])('rejects %s before saving', async (kind) => {
		const repository = new Map<string, SessionRecord>();
		createSession({ sessionId: 'invalid', config: {} }, repository);
		const event = pattern('sets', true);
		if (kind === 'long_id') event.patternPack.patterns[0].id = 'x'.repeat(97);
		if (kind === 'duplicate_id')
			event.patternPack.patterns.push(
				structuredClone(event.patternPack.patterns[0])
			);
		if (kind === 'long_mapping')
			event.patternScoring[0].patternId = 'x'.repeat(97);
		if (kind === 'duplicate_mapping')
			event.patternScoring.push({ patternId: 'sets', points: 1 });
		if (kind === 'nan_points') event.patternScoring[0].points = NaN;
		if (kind === 'string_points')
			event.patternScoring = JSON.parse('[{"patternId":"sets","points":"1"}]');
		if (kind === 'too_many_mappings')
			event.patternScoring = Array.from({ length: 33 }, (_, i) => ({
				patternId: `id-${i}`,
				points: 1
			}));
		const response = handleScoreRequest(
			'invalid',
			{ type: 'append', input: { source: 'scorekeeper', scoreEvent: event } },
			repository
		);
		expect(response.status).toBe(400);
		expect((await response.text()).length).toBeLessThan(1024);
		expect(repository.get('invalid')?.events).toHaveLength(0);
	});
	it('rejects invalid session settings before creation', async () => {
		const repository = new Map<string, SessionRecord>();
		const response = handleScoreRequest(
			'invalid-settings',
			{ type: 'create', config: { scoreRulePack: {} } },
			repository
		);
		expect(response.status).toBe(400);
		expect((await response.text()).length).toBeLessThan(1024);
		expect(repository.size).toBe(0);
	});
	it.each([4, 8000])(
		'bounds legacy errors and supports undo recovery (ID length %s)',
		async (length) => {
			const id = 'x'.repeat(length);
			const repository = new Map<string, SessionRecord>();
			const record = createSession(
				{ sessionId: 'legacy', config: {} },
				repository
			);
			record.events = [
				{
					id: 'old',
					source: 'scorekeeper',
					createdAt: record.createdAt,
					scoreEvent: pattern(id),
					sourcePayload: pattern(id)
				}
			];
			repository.set(record.id, record);
			const before = structuredClone(record);
			const response = handleScoreRequest(
				'legacy',
				{ type: 'get' },
				repository
			);
			expect(response.status).toBe(400);
			expect((await response.text()).length).toBeLessThan(1024);
			expect(repository.get('legacy')).toEqual(before);
			expect(
				handleScoreRequest(
					'legacy',
					{
						type: 'append',
						input: { source: 'scorekeeper', scoreEvent: { type: 'undo' } }
					},
					repository
				).status
			).toBe(200);
			expect(
				handleScoreRequest(
					'legacy',
					{
						type: 'append',
						input: { source: 'scorekeeper', scoreEvent: { type: 'redo' } }
					},
					repository
				).status
			).toBe(400);
			expect(repository.get('legacy')?.events).toHaveLength(2);
		}
	);
	it('preserves valid zero points and the 96-character ID boundary', () => {
		const event = pattern('x'.repeat(96), true);
		expect(
			deriveState([event], createRulePack(), { strictValidation: true })
				.totalsByPlayer
		).toEqual({ Alice: 0 });
		event.patternScoring[0].points = 2;
		expect(
			deriveState([event], createRulePack(), { strictValidation: true })
				.totalsByPlayer
		).toEqual({ Alice: 510 });
	});
});
