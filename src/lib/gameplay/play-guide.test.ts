import { describe, expect, it } from 'vitest';
import { familyRulesets } from '../rulesets/family-presets';
import { buildPlayGuide } from './play-guide';
import type { TableRules } from './table-rules';
const records = familyRulesets();
const rules = (id: string) =>
	structuredClone(
		records.find((r) => r.id === id)!.bundle.runtimeRulePack.tableRules!,
	);
const text = (r: TableRules) =>
	buildPlayGuide(r, {})
		.flatMap((s) => [s.title, ...s.steps])
		.join(' ');
describe('player guides from room policies', () => {
	it('gives every built-in a goal, actions and an ending', () => {
		for (const record of records) {
			const guide = buildPlayGuide(
				record.bundle.runtimeRulePack.tableRules!,
				{},
			);
			expect(guide.length).toBeGreaterThanOrEqual(3);
			expect(guide[0].title).toBe('Your goal');
			expect(guide.at(-1)!.title).toBe('Scoring and finishing');
		}
	});
	it('explains Solitaire destinations and Bridge vocabulary', () => {
		expect(text(rules('builtin-solitaire'))).toContain('To 3');
		expect(text(rules('builtin-solitaire'))).toContain('Recycle waste');
		expect(text(rules('builtin-bridge'))).toContain(
			'one card from each player',
		);
		expect(text(rules('builtin-bridge'))).toContain('1 means 7');
		expect(text(rules('builtin-bridge'))).toContain('dummy');
	});
	it('only describes enabled Palace effects, including restrictions on 3', () => {
		const r = rules('builtin-palace-family');
		expect(text(r)).toContain('3:');
		expect(text(r)).toContain('7:');
		expect(text(r)).toContain('3 still has to');
		r.shedding!.forcePickupThree = false;
		r.shedding!.lowSeven = false;
		r.shedding!.burnTen = false;
		r.shedding!.resetTwo = false;
		r.shedding!.fourBurn = false;
		const guide = text(r);
		for (const label of ['2:', '3:', '7:', '10:', 'Four matching'])
			expect(guide).not.toContain(label);
	});
	it('honors Golf column pairing and custom round counts', () => {
		const r = rules('builtin-six-card-golf');
		r.scoring.rounds = 5;
		expect(text(r)).toContain('same number or letter');
		expect(text(r)).toContain('5 rounds');
		delete r.scoring.columnPairs;
		expect(text(r)).not.toContain('same number or letter');
	});
	it('honors Rummy top-only pickup and optional immediate use', () => {
		const r = rules('builtin-500-rum');
		expect(text(r)).toContain('every card above it');
		expect(text(r)).toContain('immediately');
		r.discard.pickup = 'top';
		r.discard.immediateUse = false;
		expect(text(r)).toContain('top card');
		expect(text(r)).not.toContain('every card above it');
		expect(text(r)).not.toContain('immediately');
	});
	it('shows actual card values and starting hand sizes', () => {
		const r = rules('builtin-500-rum');
		expect(text(r)).toContain('13 cards with 2 players');
		expect(
			buildPlayGuide(r, { A: 17 })
				.flatMap((s) => s.steps)
				.join(' '),
		).toContain('A = 17');
	});
});
