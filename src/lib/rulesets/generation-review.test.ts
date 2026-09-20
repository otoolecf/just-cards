import { beforeEach, expect, it } from 'vitest';
import { familyRulesets } from './family-presets';
import { reviewedSources } from './reviewed-sources';
import { generateRulesetDraftWithAgent } from './llm-agent';
import { canPlayRuleset, acceptRulesetReview } from './generation-report';
import { getDefaultRulesetService, resetDefaultRulesetServiceForTests } from './default-service';
import { POST as acceptReview } from '../../routes/api/rulesets/[rulesetId]/review/+server';
import { createRoom } from '../server/room-service';
import { createJustCardsMcpServer } from '../mcp/server';
import { extractionResource, extractionFromBundle, executableLeaves } from './extraction-contract';
import type { RuntimeRulesetBundle } from './types';
const consistent = {
	verdict: 'consistent',
	issues: [],
	summary: 'No additional contradictions found.'
};
const draft = () =>
	generateRulesetDraftWithAgent({ source: { type: 'text', text: reviewedSources[0].text } });
beforeEach(() => {
	resetDefaultRulesetServiceForTests();
	process.env.RULESET_STORE_DRIVER = 'memory';
});
it('preserves the report in storage, blocks rooms and accepts an immutable reviewed copy', async () => {
	const generated = await draft(),
		service = await getDefaultRulesetService();
	const record = await service.createDraft(generated.draft);
	expect((await service.getById(record.id))?.bundle.generationReport).toEqual(
		record.bundle.generationReport
	);
	expect(() => createRoom('TESTCODE', 'Parent', 'hash', record.bundle)).toThrow('Review');
	const event = {
		params: { rulesetId: record.id },
		request: new Request('http://localhost/api/review', {
			method: 'POST',
			body: JSON.stringify({
				accept: true,
				policySnapshot: record.bundle.generationReport!.policySnapshot
			})
		})
	} as Parameters<typeof acceptReview>[0];
	const response = await acceptReview(event);
	expect(response.status).toBe(200);
	const result = (await response.json()) as { ruleset: typeof record };
	expect(result.ruleset.id).not.toBe(record.id);
	expect(canPlayRuleset(result.ruleset.bundle)).toBe(true);
	expect(canPlayRuleset((await service.getById(record.id))!.bundle)).toBe(false);
	expect(
		createRoom('NEWCODE1', 'Parent', 'hash', result.ruleset.bundle).bundle.generationReport
			?.acceptedAt
	).toBeDefined();
});
it('rejects missing acceptance, stale review and edited policy', async () => {
	const service = await getDefaultRulesetService(),
		record = await service.createDraft((await draft()).draft);
	for (const [input, status] of [
		[{ accept: false }, 400],
		[{ accept: true, policySnapshot: 'stale' }, 409]
	] as const) {
		const response = await acceptReview({
			params: { rulesetId: record.id },
			request: new Request('http://localhost/api/review', {
				method: 'POST',
				body: JSON.stringify(input)
			})
		} as Parameters<typeof acceptReview>[0]);
		expect(response.status).toBe(status);
	}
	record.bundle.runtimeRulePack.tableRules!.deal.cardsPerPlayer = 5;
	expect(() => acceptRulesetReview(record.bundle)).toThrow('changed');
	expect(canPlayRuleset(record.bundle)).toBe(false);
	await expect(service.createDraft({ ...record, bundle: record.bundle })).rejects.toThrow();
});
it('MCP shares the same schema, generation and behavior review gate', async () => {
	const service = await getDefaultRulesetService();
	const server = createJustCardsMcpServer({
		rulesetService: service,
		sessionSampler: async (r) =>
			r.stage === 'review' ? consistent : extractionFromBundle(familyRulesets()[0].bundle)
	});
	expect((await server.readResource('just-cards://schemas/rule-extraction-v1')).json).toEqual(
		extractionResource()
	);
	const result = (await server.callTool('generate_ruleset', {
		source: { type: 'text', text: reviewedSources[0].text }
	})) as { ruleset: { id: string; bundle: RuntimeRulesetBundle } };
	expect(result.ruleset.bundle.generationReport?.behavior.pass).toBe(true);
	const validation = (await server.callTool('validate_ruleset', {
		ruleset_id: result.ruleset.id
	})) as { pass: boolean; playable: boolean; behavior: { pass: boolean } };
	expect(validation.behavior.pass).toBe(true);
	expect(validation.pass).toBe(false);
	expect(validation.playable).toBe(false);
});
it('fully evidenced, source-reviewed supported rules are ready without a manual waiver', async () => {
	const source = reviewedSources[0].text;
	const e = extractionFromBundle(familyRulesets()[0].bundle);
	// Transport fixture: fidelity verdict is mocked; quote/path verification is real.
	e.evidence = executableLeaves({ tableRules: e.tableRules, cardValues: e.cardValues }).map(
		(path) => ({ path, quote: source.slice(0, 30) })
	);
	const result = await generateRulesetDraftWithAgent(
		{ source: { type: 'text', text: source } },
		{ model: async (r) => (r.stage === 'review' ? consistent : e) }
	);
	expect(canPlayRuleset(result.draft.bundle as RuntimeRulesetBundle)).toBe(true);
});
it('a source-review contradiction cannot be waived even after engine checks pass', async () => {
	const result = await generateRulesetDraftWithAgent(
		{ source: { type: 'text', text: reviewedSources[0].text } },
		{
			model: async (r) =>
				r.stage === 'review'
					? {
							verdict: 'contradiction',
							issues: ['Missing required extra final turns'],
							summary: 'Round ending differs.'
						}
					: extractionFromBundle(familyRulesets()[0].bundle)
		}
	);
	const b = result.draft.bundle as RuntimeRulesetBundle;
	expect(b.generationReport?.behavior.pass).toBe(true);
	expect(b.generationReport?.status).toBe('blocked');
	expect(() => acceptRulesetReview(b)).toThrow();
});
it('missing executable mechanics remain blocked and malformed report metadata cannot be stored', async () => {
	const result = await generateRulesetDraftWithAgent(
		{ source: { type: 'text', text: 'Play a game of tricks with bidding.' } },
		{
			model: async (r) =>
				r.stage === 'review'
					? consistent
					: {
							...extractionFromBundle(familyRulesets()[0].bundle),
							tableRules: null,
							unsupported: ['Bidding and tricks']
						}
		}
	);
	const b = result.draft.bundle as RuntimeRulesetBundle;
	expect(b.generationReport?.status).toBe('blocked');
	const service = await getDefaultRulesetService();
	await expect(
		service.createDraft({
			...result.draft,
			bundle: { ...b, generationReport: { status: 'ready' } }
		})
	).rejects.toThrow('report');
});
