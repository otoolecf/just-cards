import { beforeEach, describe, expect, it } from 'vitest';

import { resetDefaultRulesetServiceForTests } from '$lib/rulesets/default-service';
import { POST as createRuleset } from '../../api/rulesets/+server';
import { load } from './+page.server';

function eventForPost(body: unknown): Parameters<typeof createRuleset>[0] {
	return {
		params: {},
		request: new Request('http://localhost/api/rulesets', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as Parameters<typeof createRuleset>[0];
}

describe('play ruleset loader', () => {
	beforeEach(() => {
		resetDefaultRulesetServiceForTests();
		process.env.RULESET_STORE_DRIVER = 'memory';
	});

	it('play_ruleset_loader_returns_ruleset_record_for_existing_id', async () => {
		const createdResponse = await createRuleset(
			eventForPost({
				name: 'Loader test ruleset',
				origin: 'manual',
				bundle: {
					bundleVersion: 'runtime-bundle/v1',
					gameId: 'loader-test',
					displayName: 'Loader Test',
					runtimeRulePack: {
						scoringTriggers: []
					}
				}
			})
		);
		expect(createdResponse.status).toBe(200);
		const created = (await createdResponse.json()) as { id: string; bundle: { uiProfile: { schemaVersion: string } } };

		const data = (await load({
			params: { rulesetId: created.id }
		} as Parameters<typeof load>[0])) as {
			ruleset: { id: string; bundle: { uiProfile: { schemaVersion: string } } };
		};

		expect(data.ruleset.id).toBe(created.id);
		expect(data.ruleset.bundle.uiProfile.schemaVersion).toBe('ui-profile/v0');
	});

	it('play_ruleset_loader_throws_404_for_unknown_ruleset', async () => {
		await expect(
			load({ params: { rulesetId: 'missing-ruleset' } } as Parameters<typeof load>[0])
		).rejects.toMatchObject({ status: 404 });
	});
});
