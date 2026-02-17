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

	it('rulesets_api_create_and_list_roundtrip', async () => {
		const createResponse = await createRuleset(
			eventForPost({
				name: 'Test Ruleset',
				origin: 'manual',
				bundle: {
					bundleVersion: 'runtime-bundle/v0',
					gameId: 'golf',
					displayName: 'Golf',
					runtimeRulePack: {
						scoringTriggers: []
					}
				}
			})
		);
		expect(createResponse.status).toBe(200);

		const listResponse = await listRulesets(eventForGet());
		expect(listResponse.status).toBe(200);
		const payload = (await listResponse.json()) as { rulesets: Array<{ name: string }> };
		expect(payload.rulesets).toHaveLength(1);
		expect(payload.rulesets[0].name).toBe('Test Ruleset');
	});

	it('rulesets_api_get_returns_404_for_unknown_id', async () => {
		const response = await getRulesetById(eventForGetById('missing'));
		expect(response.status).toBe(404);
		const payload = (await response.json()) as { error: string };
		expect(payload.error).toContain('not found');
	});
});
