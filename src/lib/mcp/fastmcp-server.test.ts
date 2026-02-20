import { beforeEach, describe, expect, it } from 'vitest';
import { resetDefaultRulesetServiceForTests } from '$lib/rulesets/default-service';
import { createFastMcpEdgeServer } from './fastmcp-server';

function request(
	body: Record<string, unknown>,
	sessionId?: string,
	path = 'http://localhost/api/mcp'
): Request {
	const headers = new Headers({
		'content-type': 'application/json',
		accept: 'application/json, text/event-stream'
	});
	if (sessionId) {
		headers.set('mcp-session-id', sessionId);
	}
	return new Request(path, {
		method: 'POST',
		headers,
		body: JSON.stringify(body)
	});
}

describe('fastmcp edge server bridge', () => {
	beforeEach(() => {
		resetDefaultRulesetServiceForTests();
		process.env.RULESET_STORE_DRIVER = 'memory';
	});

	it('fastmcp_bridge_tools_list_matches_domain_tools', async () => {
		const server = await createFastMcpEdgeServer();
		const init = await server.fetch(
			request({
				jsonrpc: '2.0',
				id: 'init',
				method: 'initialize',
				params: {
					protocolVersion: '2025-03-26',
					capabilities: {},
					clientInfo: { name: 'vitest', version: '1.0.0' }
				}
			})
		);
		expect(init.status).toBe(200);

		const tools = await server.fetch(
			request({
				jsonrpc: '2.0',
				id: 'tools',
				method: 'tools/list',
				params: {}
			})
		);
		expect(tools.status).toBe(200);
		const toolsText = await tools.text();
		expect(toolsText).toContain('generate_ruleset');
		expect(toolsText).toContain('suggest_move');
	});

	it('fastmcp_bridge_resources_list_and_read_match_domain_resources', async () => {
		const server = await createFastMcpEdgeServer();
		const init = await server.fetch(
			request({
				jsonrpc: '2.0',
				id: 'init2',
				method: 'initialize',
				params: {
					protocolVersion: '2025-03-26',
					capabilities: {},
					clientInfo: { name: 'vitest', version: '1.0.0' }
				}
			})
		);
		const resourcesList = await server.fetch(
			request({
				jsonrpc: '2.0',
				id: 'resources',
				method: 'resources/list',
				params: {}
			})
		);
		expect(resourcesList.status).toBe(200);
		const listText = await resourcesList.text();
		expect(listText).toContain('just-cards://docs/primitives-kb-v0');
		expect(listText).toContain('ui://just-cards/apps/play-table/v1');

		const resourcesRead = await server.fetch(
			request({
				jsonrpc: '2.0',
				id: 'resource-read',
				method: 'resources/read',
				params: { uri: 'just-cards://docs/primitives-kb-v0' }
			})
		);
		expect(resourcesRead.status).toBe(200);
		const readText = await resourcesRead.text();
		expect(readText).toContain('Primitives KB v0');

		const uiResourcesRead = await server.fetch(
			request({
				jsonrpc: '2.0',
				id: 'resource-read-ui',
				method: 'resources/read',
				params: { uri: 'ui://just-cards/apps/play-table/v1' }
			})
		);
		expect(uiResourcesRead.status).toBe(200);
		const uiReadText = await uiResourcesRead.text();
		expect(uiReadText).toContain('just-cards-mcp-app-play-table');
		expect(uiReadText).toContain("TOOL_SUBMIT = 'submit_move'");
		expect(uiReadText).toContain("TOOL_RENDER = 'render_game_table'");
		expect(uiReadText).toContain('window.openai.callTool');
		expect(uiReadText).toContain('setInterval(');

		const uiLeaderboardRead = await server.fetch(
			request({
				jsonrpc: '2.0',
				id: 'resource-read-ui-score',
				method: 'resources/read',
				params: { uri: 'ui://just-cards/apps/score-leaderboard/v1' }
			})
		);
		expect(uiLeaderboardRead.status).toBe(200);
		const leaderboardText = await uiLeaderboardRead.text();
		expect(leaderboardText).toContain("TOOL_RENDER_SCORE = 'render_score_leaderboard'");
		expect(leaderboardText).toContain('window.openai.callTool');
		expect(leaderboardText).toContain('setInterval(');
	});

	it('fastmcp_bridge_exposes_mcp_apps_render_tool_metadata', async () => {
		const server = await createFastMcpEdgeServer();
		const init = await server.fetch(
			request({
				jsonrpc: '2.0',
				id: 'init3',
				method: 'initialize',
				params: {
					protocolVersion: '2025-03-26',
					capabilities: {},
					clientInfo: { name: 'vitest', version: '1.0.0' }
				}
			})
		);
		expect(init.status).toBe(200);

		const tools = await server.fetch(
			request({
				jsonrpc: '2.0',
				id: 'tools3',
				method: 'tools/list',
				params: {}
			})
		);
		expect(tools.status).toBe(200);
		const payload = (await tools.json()) as {
			result?: { tools?: Array<{ name?: string; _meta?: Record<string, unknown> }> };
		};
		const renderGameTool = payload.result?.tools?.find((tool) => tool.name === 'render_game_table');
		const renderScoreTool = payload.result?.tools?.find((tool) => tool.name === 'render_score_leaderboard');

		expect(renderGameTool?._meta?.['openai/outputTemplate']).toBe('ui://just-cards/apps/play-table/v1');
		expect(renderScoreTool?._meta?.['openai/outputTemplate']).toBe(
			'ui://just-cards/apps/score-leaderboard/v1'
		);
		expect(renderGameTool?._meta?.ui).toMatchObject({ resourceUri: 'ui://just-cards/apps/play-table/v1' });
	});
});
