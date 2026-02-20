import { beforeEach, describe, expect, it } from 'vitest';
import { getDefaultRulesetService, resetDefaultRulesetServiceForTests } from '$lib/rulesets/default-service';
import { compileRuleFactsToBundle, extractRuleFacts } from '$lib/rulesets/generator';
import { appendSessionEvent, createSession, resetInMemorySessionsForTests } from '$lib/session/session-store';
import { createRulePack } from '$lib/scorekeeper/engine';
import { POST as mcpPost } from '../../routes/api/mcp/+server';
import { GET as mcpSseGet } from '../../routes/api/mcp/sse/+server';

function authHeaders(token = 'mcp-test-token'): Record<string, string> {
	return {
		authorization: `Bearer ${token}`,
		accept: 'application/json, text/event-stream',
		'content-type': 'application/json'
	};
}

function mcpEvent(body: unknown, sessionId?: string): Parameters<typeof mcpPost>[0] {
	const headers = authHeaders();
	if (sessionId) {
		headers['mcp-session-id'] = sessionId;
	}

	return {
		params: {},
		url: new URL('http://localhost/api/mcp'),
		request: new Request('http://localhost/api/mcp', {
			method: 'POST',
			headers,
			body: JSON.stringify(body)
		})
	} as Parameters<typeof mcpPost>[0];
}

function mcpSseEvent(): Parameters<typeof mcpSseGet>[0] {
	return {
		params: {},
		url: new URL('http://localhost/api/mcp/sse'),
		request: new Request('http://localhost/api/mcp/sse', {
			method: 'GET',
			headers: authHeaders()
		})
	} as Parameters<typeof mcpSseGet>[0];
}

function parseToolCallPayloadText(responseText: string): Record<string, unknown> | null {
	let envelope: unknown;
	try {
		envelope = JSON.parse(responseText);
	} catch {
		return null;
	}
	if (!envelope || typeof envelope !== 'object') {
		return null;
	}
	const result = (envelope as { result?: unknown }).result;
	if (!result || typeof result !== 'object') {
		return null;
	}
	const content = (result as { content?: unknown }).content;
	if (!Array.isArray(content)) {
		return null;
	}
	for (const entry of content) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}
		const type = (entry as { type?: unknown }).type;
		const text = (entry as { text?: unknown }).text;
		if (type !== 'text' || typeof text !== 'string') {
			continue;
		}
		try {
			const parsed = JSON.parse(text);
			if (parsed && typeof parsed === 'object') {
				return parsed as Record<string, unknown>;
			}
		} catch {
			continue;
		}
	}
	return null;
}

describe('fastmcp api', () => {
	beforeEach(() => {
		resetDefaultRulesetServiceForTests();
		resetInMemorySessionsForTests();
		process.env.RULESET_STORE_DRIVER = 'memory';
		process.env.JUST_CARDS_MCP_AUTH_TOKEN = 'mcp-test-token';
		delete process.env.JUST_CARDS_MCP_OAUTH_ISSUER;
		delete process.env.JUST_CARDS_MCP_OAUTH_JWKS_URL;
		delete process.env.JUST_CARDS_MCP_OAUTH_AUDIENCE;
		delete process.env.JUST_CARDS_MCP_OAUTH_REQUIRED_SCOPES;
	});

	it('mcp_streamable_http_initialize_and_tools_list_roundtrip', async () => {
		const initializeResponse = await mcpPost(
			mcpEvent({
				jsonrpc: '2.0',
				id: 'init-1',
				method: 'initialize',
				params: {
					protocolVersion: '2025-03-26',
					capabilities: {},
					clientInfo: { name: 'test-client', version: '1.0.0' }
				}
			})
		);
		expect(initializeResponse.status).toBe(200);
		const initText = await initializeResponse.text();
		expect(initText).toContain('"jsonrpc":"2.0"');
		expect(initText).toContain('"serverInfo"');

		const toolsResponse = await mcpPost(
			mcpEvent({
				jsonrpc: '2.0',
				id: 'tools-1',
				method: 'tools/list',
				params: {}
			})
		);
		expect(toolsResponse.status).toBe(200);
		const toolsText = await toolsResponse.text();
		expect(toolsText).toContain('generate_ruleset');

		const resourcesResponse = await mcpPost(
			mcpEvent({
				jsonrpc: '2.0',
				id: 'resources-1',
				method: 'resources/list',
				params: {}
			})
		);
		expect(resourcesResponse.status).toBe(200);
		const resourcesText = await resourcesResponse.text();
		expect(resourcesText).toContain('just-cards://docs/primitives-kb-v0');

		const callResponse = await mcpPost(
			mcpEvent({
				jsonrpc: '2.0',
				id: 'call-1',
				method: 'tools/call',
				params: {
					name: 'list_rulesets',
					arguments: {}
				}
			})
		);
		expect(callResponse.status).toBe(200);
		const callText = await callResponse.text();
		expect(callText).toContain('call-1');
	});

	it('mcp_sse_compat_endpoint_redirects_to_streamable_http_transport', async () => {
		const response = await mcpSseGet(mcpSseEvent());
		expect(response.status).toBe(307);
		expect(response.headers.get('location') ?? '').toContain('/api/mcp');
	});

	it('mcp_streamable_http_can_call_render_tools', async () => {
		const rulesetService = await getDefaultRulesetService();
		const seededRuleset = await rulesetService.createDraft({
			name: 'Render API Test Rummy',
			origin: 'manual',
			bundle: compileRuleFactsToBundle(
				extractRuleFacts({
					sourceText: '500 Rum. Deal seven cards. Draw from stock or discard, then meld/discard.'
				})
			)
		});

		await mcpPost(
			mcpEvent({
				jsonrpc: '2.0',
				id: 'init-render',
				method: 'initialize',
				params: {
					protocolVersion: '2025-03-26',
					capabilities: {},
					clientInfo: { name: 'test-client', version: '1.0.0' }
				}
			})
		);

		const started = await mcpPost(
			mcpEvent({
				jsonrpc: '2.0',
				id: 'start-1',
				method: 'tools/call',
				params: {
					name: 'start_game',
					arguments: {
						ruleset_id: seededRuleset.id,
						players: ['You', 'Riv', 'Mina']
					}
				}
			})
		);
		const startedText = await started.text();
		const startedPayload = parseToolCallPayloadText(startedText);
		const gameId = typeof startedPayload?.gameId === 'string' ? startedPayload.gameId : '';
		expect(gameId).toBeTruthy();

		const renderGame = await mcpPost(
			mcpEvent({
				jsonrpc: '2.0',
				id: 'render-game-1',
				method: 'tools/call',
				params: {
					name: 'render_game_table',
					arguments: {
						game_id: gameId,
						viewer_player_id: 'You'
					}
				}
			})
		);
		expect(renderGame.status).toBe(200);
		const renderGameText = await renderGame.text();
		expect(renderGameText).toContain('play_table/v1');
		expect(renderGameText).toContain('surface');

		const lowWinsSession = createSession({
			sessionId: 'sess-render-low',
			config: {
				scoreWinDirection: 'low_wins',
				scoreRulePack: createRulePack()
			}
		});
		appendSessionEvent(lowWinsSession.id, {
			source: 'scorekeeper',
			scoreEvent: {
				type: 'add_delta',
				entries: [
					{ target: { kind: 'player', id: 'You' }, delta: 10 },
					{ target: { kind: 'player', id: 'Riv' }, delta: 7 }
				]
			}
		});
		const renderScore = await mcpPost(
			mcpEvent({
				jsonrpc: '2.0',
				id: 'render-score-1',
				method: 'tools/call',
				params: {
					name: 'render_score_leaderboard',
					arguments: {
						session_id: lowWinsSession.id
					}
				}
			})
		);
		expect(renderScore.status).toBe(200);
		const renderScoreText = await renderScore.text();
		expect(renderScoreText).toContain('score_leaderboard/v1');
		expect(renderScoreText).toContain('low_wins');
	});
});
