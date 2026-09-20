import { describe, expect, it } from 'vitest';
import { familyRulesets } from './family-presets';
import { extractionSchema, parseExtraction, extractionFromBundle } from './extraction-contract';
import { evaluateTableBehavior } from './behavioral-validation';
import { generateRulesetDraftWithAgent } from './llm-agent';
import { canPlayRuleset, acceptRulesetReview } from './generation-report';

const golf = familyRulesets()[0].bundle;
const source =
	'Our family plays with a rectangle of six cards. We use the described house scoring.';
const candidate = () => extractionFromBundle(golf);
const review = {
	verdict: 'consistent',
	issues: [],
	summary: 'No additional contradictions found.'
};
function mockedModel(outputs: unknown[]) {
	const requests: Record<string, any>[] = [];
	const fetchImpl: typeof fetch = async (_url, init) => {
		requests.push(JSON.parse(String(init?.body)));
		return Response.json({
			choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(outputs.shift()) } }]
		});
	};
	return { fetchImpl, requests };
}
describe('shared executable extraction', () => {
	it('strictly validates the contract and rejects unknown executable fields', () => {
		const raw = candidate();
		expect(parseExtraction(raw).tableRules?.layout?.columns).toBe(3);
		expect(extractionSchema.additionalProperties).toBe(false);
		expect(() => parseExtraction({ ...raw, execute: 'arbitrary code' })).toThrow();
		expect(() =>
			parseExtraction({ ...raw, cardValues: { ...raw.cardValues, K: 'zero' } })
		).toThrow();
	});
	it('runs reproducible actual-engine simulations and independent scoring', () => {
		for (const { bundle } of familyRulesets().filter(r=>r.bundle.runtimeRulePack.tableRules?.layout || r.bundle.runtimeRulePack.tableRules?.meld)) {
			const a = evaluateTableBehavior(bundle);
			expect(a.pass).toBe(true);
			expect(a).toEqual(evaluateTableBehavior(bundle));
			expect(a.simulations.length).toBeGreaterThan(1);
			expect(a.checks.some((c) => c.id === 'independent-scoring' && c.pass)).toBe(true);
			expect(a.simulations.every((s) => s.completed && s.commands > 0)).toBe(true);
		}
	});
	it('rejects invalid executable policies rather than throwing from the report', () => {
		const bad = structuredClone(golf);
		bad.runtimeRulePack.tableRules!.deal.cardsPerPlayer = 52;
		expect(evaluateTableBehavior(bad).pass).toBe(false);
	});
	it('extracts a policy from unfamiliar prose and makes assumptions reviewable', async () => {
		const { fetchImpl, requests } = mockedModel([candidate(), review]);
		const result = await generateRulesetDraftWithAgent(
			{ source: { type: 'text', text: source } },
			{ apiKey: 'test', fetchImpl }
		);
		const bundle = result.draft.bundle as typeof golf;
		expect(result.pipeline.strategy).toBe('llm');
		expect(bundle.runtimeRulePack.tableRules?.layout?.columns).toBe(3);
		expect(requests[0].response_format.json_schema.schema).toEqual(extractionSchema);
		expect(requests[1].messages[0].content).toContain('review');
		expect(bundle.generationReport?.status).toBe('needs_review');
		expect(canPlayRuleset(bundle)).toBe(false);
		expect(canPlayRuleset(acceptRulesetReview(bundle))).toBe(true);
	});
	it('never approves unsupported mechanics or fabricated quotations', async () => {
		const raw = candidate();
		raw.unsupported = ['Jokers act as wild cards'];
		raw.evidence = [
			{ path: 'tableRules.deal.cardsPerPlayer', quote: 'This quotation is invented' }
		];
		const { fetchImpl } = mockedModel([raw, review, raw, review]);
		const result = await generateRulesetDraftWithAgent(
			{ source: { type: 'text', text: source } },
			{ apiKey: 'test', fetchImpl }
		);
		const bundle = result.draft.bundle as typeof golf;
		expect(canPlayRuleset(bundle)).toBe(false);
		expect(bundle.generationReport?.status).toBe('blocked');
		expect(() => acceptRulesetReview(bundle)).toThrow();
	});
	it('invalid model output falls back only to a visibly unreviewed draft', async () => {
		const { fetchImpl } = mockedModel([{}, {}, {}, {}]);
		const result = await generateRulesetDraftWithAgent(
			{ source: { type: 'text', text: source } },
			{ apiKey: 'test', fetchImpl }
		);
		expect(result.pipeline.strategy).toBe('deterministic');
		expect(canPlayRuleset(result.draft.bundle as typeof golf)).toBe(false);
	});
});

it('shares structural validation with the runtime, including unknown fields and duplicate zones', async () => {
	const { validateTableRules } = await import('../gameplay/table-rules');
	const rules = structuredClone(golf.runtimeRulePack.tableRules!);
	expect(() => validateTableRules({ ...rules, jokers: true })).toThrow('unknown');
	rules.scoring.zones.push({ ...rules.scoring.zones[0] });
	expect(() => validateTableRules(rules)).toThrow('scoring zones');
});
it('fails behavior validation for unsupported conditional score modifiers', () => {
	const bad = structuredClone(golf);
	(bad.runtimeRulePack.scoreRulePack as { modifiers: unknown[] }).modifiers = [
		{ id: 'unexpected' }
	];
	expect(evaluateTableBehavior(bad).pass).toBe(false);
});
it('gives the model actionable compatibility errors for invalid layout policies', async () => {
	const { validateTableRules } = await import('../gameplay/table-rules');
	const r = structuredClone(golf.runtimeRulePack.tableRules!);
	expect(() =>
		validateTableRules({ ...r, discard: { pickup: 'top', immediateUse: true } })
	).toThrow('immediateUse requires meld');
	expect(() => validateTableRules({ ...r, scoring: { ...r.scoring, columnPairs: 2 } })).toThrow(
		'columnPairs must equal layout.columns'
	);
});
it('constrains model evidence to canonical leaf paths in the schema', () => {
	const raw = candidate();
	raw.evidence = [{ path: 'tableRules.players', quote: '2 to 4 players' }];
	expect(() => parseExtraction(raw)).toThrow();
});
