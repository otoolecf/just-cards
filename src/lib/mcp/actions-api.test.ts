import { beforeEach, describe, expect, it } from 'vitest';
import { resetDefaultRulesetServiceForTests } from '$lib/rulesets/default-service';
import { POST as chatActionPost } from '../../routes/api/chat/actions/+server';

function authHeaders(token = 'mcp-test-token'): Record<string, string> {
	return {
		authorization: `Bearer ${token}`,
		'content-type': 'application/json'
	};
}

function actionEvent(body: unknown, fetchImpl?: typeof fetch, token = 'mcp-test-token'): Parameters<typeof chatActionPost>[0] {
	return {
		params: {},
		request: new Request('http://localhost/api/chat/actions', {
			method: 'POST',
			headers: authHeaders(token),
			body: JSON.stringify(body)
		}),
		...(fetchImpl ? { fetch: fetchImpl } : {})
	} as Parameters<typeof chatActionPost>[0];
}

describe('chat actions api', () => {
	beforeEach(() => {
		resetDefaultRulesetServiceForTests();
		process.env.RULESET_STORE_DRIVER = 'memory';
		process.env.JUST_CARDS_MCP_AUTH_TOKEN = 'mcp-test-token';
	});

	it('chat_actions_create_explain_open_and_next_move_flow_roundtrip', async () => {
		const sourceUrl = 'https://bicyclecards.com/how-to-play/six-card-golf';
		const fetchImpl: typeof fetch = async (input) => {
			const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
			if (url === sourceUrl) {
				return new Response(
					'<html><body><h1>Six Card Golf</h1><p>Deal 6 cards in 2 rows of 3. Lowest score wins.</p></body></html>',
					{
						status: 200,
						headers: { 'content-type': 'text/html' }
					}
				);
			}
			return new Response('not found', { status: 404 });
		};

		const createResponse = await chatActionPost(
			actionEvent(
				{
					action: 'create_from_url',
					input: { url: sourceUrl, model_source: 'server' }
				},
				fetchImpl
			)
		);
		expect(createResponse.status).toBe(200);
		const createPayload = (await createResponse.json()) as {
			result: {
				rulesetId: string;
				playUrl: string;
				validation: { pass: boolean };
			};
		};
		expect(createPayload.result.rulesetId).toContain('ruleset-');
		expect(createPayload.result.playUrl).toContain(`/play/${createPayload.result.rulesetId}`);
		expect(createPayload.result.validation.pass).toBe(false); // Incomplete prose remains an unreviewed draft.

		const explainResponse = await chatActionPost(
			actionEvent({
				action: 'explain_rules',
				input: { ruleset_id: createPayload.result.rulesetId }
			})
		);
		expect(explainResponse.status).toBe(200);
		const explainPayload = (await explainResponse.json()) as {
			result: { rulesetId: string; summary: string };
		};
		expect(explainPayload.result.rulesetId).toBe(createPayload.result.rulesetId);
		expect(explainPayload.result.summary.length).toBeGreaterThan(10);

		const openResponse = await chatActionPost(
			actionEvent({
				action: 'open_playable_table',
				input: { ruleset_id: createPayload.result.rulesetId }
			})
		);
		expect(openResponse.status).toBe(200);
		const openPayload = (await openResponse.json()) as { result: { playUrl: string } };
		expect(openPayload.result.playUrl).toContain(`/play/${createPayload.result.rulesetId}`);

		const nextMoveResponse = await chatActionPost(
			actionEvent({
				action: 'ask_next_move',
				input: {
					ruleset_id: createPayload.result.rulesetId,
					players: ['You', 'Riv', 'Mina'],
					mode: 'opponent',
					apply: true
				}
			})
		);
		expect(nextMoveResponse.status).toBe(200);
		const nextPayload = (await nextMoveResponse.json()) as {
			result: { gameId: string; applied: boolean; move: { type: string }; mode: string };
		};
		expect(nextPayload.result.gameId).toContain('game-');
		expect(nextPayload.result.mode).toBe('opponent');
		expect(nextPayload.result.applied).toBe(true);
		expect(nextPayload.result.move.type.length).toBeGreaterThan(0);
	});
});
