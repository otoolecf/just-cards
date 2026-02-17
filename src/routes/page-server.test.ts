import { beforeEach, describe, expect, it } from 'vitest';

import { resetDefaultRulesetServiceForTests } from '$lib/rulesets/default-service';
import { POST as createRuleset } from './api/rulesets/+server';
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

describe('score page server load', () => {
	beforeEach(() => {
		resetDefaultRulesetServiceForTests();
		process.env.RULESET_STORE_DRIVER = 'memory';
	});

	it('score_page_loader_returns_existing_rulesets', async () => {
		const createResponse = await createRuleset(
			eventForPost({
				name: 'Score loader ruleset',
				origin: 'manual',
				bundle: {
					bundleVersion: 'runtime-bundle/v1',
					gameId: 'score-loader-game',
					displayName: 'Score Loader Game',
					runtimeRulePack: {
						scoringTriggers: []
					}
				}
			})
		);
		expect(createResponse.status).toBe(200);

		const data = (await load({} as Parameters<typeof load>[0])) as {
			rulesets: Array<{ id: string; name: string }>;
		};

		expect(data.rulesets.length).toBeGreaterThanOrEqual(1);
		expect(data.rulesets.some((ruleset) => ruleset.name === 'Score loader ruleset')).toBe(true);
	});
});
