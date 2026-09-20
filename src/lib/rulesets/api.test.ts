import { beforeEach, describe, expect, it } from 'vitest';

import { resetDefaultRulesetServiceForTests } from './default-service';
import { GET as getRulesetById } from '../../routes/api/rulesets/[rulesetId]/+server';
import { GET as listRulesets, POST as createRuleset } from '../../routes/api/rulesets/+server';

function eventForPost(body: unknown, params: Record<string, string> = {}): Parameters<typeof createRuleset>[0] {
	return {
		params,
		request: new Request('http://localhost/api/rulesets', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as Parameters<typeof createRuleset>[0];
}

function eventForGet(params: Record<string, string> = {}): Parameters<typeof listRulesets>[0] {
	return {
		params,
		request: new Request('http://localhost/api/rulesets', {
			method: 'GET'
		})
	} as Parameters<typeof listRulesets>[0];
}

function eventForGetById(rulesetId: string): Parameters<typeof getRulesetById>[0] {
	return {
		params: { rulesetId },
		request: new Request(`http://localhost/api/rulesets/${rulesetId}`, {
			method: 'GET'
		})
	} as Parameters<typeof getRulesetById>[0];
}

describe('rulesets api', () => {
	beforeEach(() => {
		resetDefaultRulesetServiceForTests();
		process.env.RULESET_STORE_DRIVER = 'memory';
	});

	it('rulesets_api_create_and_list_roundtrip_uses_v1_bundle', async () => {
		const createResponse = await createRuleset(
			eventForPost({
				name: 'Test Ruleset',
				origin: 'manual',
				bundle: {
					bundleVersion: 'runtime-bundle/v1',
					gameId: 'golf',
					displayName: 'Golf',
					runtimeRulePack: {
						scoringTriggers: []
					}
				}
			})
		);
		expect(createResponse.status).toBe(200);

		const createdPayload = (await createResponse.json()) as {
			bundle: { bundleVersion: string; uiProfile: { schemaVersion: string } };
		};
		expect(createdPayload.bundle.bundleVersion).toBe('runtime-bundle/v1');
		expect(createdPayload.bundle.uiProfile.schemaVersion).toBe('ui-profile/v0');

		const listResponse = await listRulesets(eventForGet());
		expect(listResponse.status).toBe(200);
		const payload = (await listResponse.json()) as {
			rulesets: Array<{ name: string; bundle: { bundleVersion: string; uiProfile: { schemaVersion: string } } }>;
		};
		expect(payload.rulesets).toHaveLength(7);
		payload.rulesets = payload.rulesets.filter(r => r.name === 'Test Ruleset');
		expect(payload.rulesets[0].name).toBe('Test Ruleset');
		expect(payload.rulesets[0].bundle.bundleVersion).toBe('runtime-bundle/v1');
		expect(payload.rulesets[0].bundle.uiProfile.schemaVersion).toBe('ui-profile/v0');
	});

	it('rulesets_api_get_returns_404_for_unknown_id', async () => {
		const response = await getRulesetById(eventForGetById('missing'));
		expect(response.status).toBe(404);
		const payload = (await response.json()) as { error: string };
		expect(payload.error).toContain('not found');
	});

	it('rulesets_api_create_rejects_invalid_explain_schema', async () => {
		const response = await createRuleset(
			eventForPost({
				name: 'Invalid explain',
				origin: 'manual',
				bundle: {
					bundleVersion: 'runtime-bundle/v1',
					gameId: 'invalid-explain',
					displayName: 'Invalid Explain',
					runtimeRulePack: {
						scoringTriggers: []
					},
					explain: {
						schemaVersion: 'wrong-schema'
					}
				}
			})
		);
		expect(response.status).toBe(400);
		const payload = (await response.json()) as { error: string };
		expect(payload.error).toContain('explain.schemaVersion');
	});

	it('rulesets_api_create_preserves_explainability_payload', async () => {
		const createResponse = await createRuleset(
			eventForPost({
				name: 'Explainable Ruleset',
				origin: 'llm',
				bundle: {
					bundleVersion: 'runtime-bundle/v1',
					gameId: 'explainable',
					displayName: 'Explainable',
					runtimeRulePack: {
						scoringTriggers: []
					},
					explain: {
						schemaVersion: 'ruleset-explain/v0',
						goal: 'Get the lowest score.',
						playerRange: { min: 2, max: 4 },
						turnFlow: { drawFrom: ['Stock'], playTo: ['Discard'] },
						scoring: { lowScoreWins: true, aceValue: 1, rankOverrides: [] },
						zones: [{ id: 'stock', label: 'Stock', hint: 'Draw pile' }],
						diagnostics: ['deal 6 cards to each player'],
						source: { type: 'url', url: 'https://example.com' },
						generatedAt: '2026-02-18T00:00:00.000Z'
					}
				}
			})
		);
		expect(createResponse.status).toBe(200);
		const created = (await createResponse.json()) as { id: string };

		const getResponse = await getRulesetById(eventForGetById(created.id));
		expect(getResponse.status).toBe(200);
		const payload = (await getResponse.json()) as {
			bundle: { explain?: { schemaVersion: string; diagnostics: string[] } };
		};
		expect(payload.bundle.explain?.schemaVersion).toBe('ruleset-explain/v0');
		expect(payload.bundle.explain?.diagnostics).toEqual(
			expect.arrayContaining(['deal 6 cards to each player'])
		);
	});
});
