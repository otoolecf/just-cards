import { beforeEach, describe, expect, it } from 'vitest';
import { resetDefaultRulesetServiceForTests } from '$lib/rulesets/default-service';
import { GET as listMcpTools } from '../../routes/api/mcp/tools/+server';
import { GET as listMcpResources } from '../../routes/api/mcp/resources/+server';
import { POST as callMcpTool } from '../../routes/api/mcp/call/+server';

function authHeaders(token = 'mcp-test-token'): Record<string, string> {
	return {
		authorization: `Bearer ${token}`,
		'content-type': 'application/json'
	};
}

function listToolsEvent(token?: string): Parameters<typeof listMcpTools>[0] {
	return {
		params: {},
		request: new Request('http://localhost/api/mcp/tools', {
			method: 'GET',
			headers: token ? authHeaders(token) : undefined
		})
	} as Parameters<typeof listMcpTools>[0];
}

function listResourcesEvent(search = '', token?: string): Parameters<typeof listMcpResources>[0] {
	return {
		params: {},
		url: new URL(`http://localhost/api/mcp/resources${search}`),
		request: new Request(`http://localhost/api/mcp/resources${search}`, {
			method: 'GET',
			headers: token ? authHeaders(token) : undefined
		})
	} as Parameters<typeof listMcpResources>[0];
}

function callToolEvent(
	body: unknown,
	token?: string,
	fetchImpl?: typeof fetch
): Parameters<typeof callMcpTool>[0] {
	return {
		params: {},
		request: new Request('http://localhost/api/mcp/call', {
			method: 'POST',
			headers: token ? authHeaders(token) : { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		...(fetchImpl ? { fetch: fetchImpl } : {})
	} as Parameters<typeof callMcpTool>[0];
}

describe('mcp http api', () => {
	beforeEach(() => {
		resetDefaultRulesetServiceForTests();
		process.env.RULESET_STORE_DRIVER = 'memory';
		process.env.JUST_CARDS_MCP_AUTH_TOKEN = 'mcp-test-token';
	});

	it('mcp_http_endpoints_require_auth_and_execute_tool_calls', async () => {
		const fetchImpl: typeof fetch = async (input) => {
			const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
			if (url === 'https://api.openai.com/v1/chat/completions') {
				return new Response('upstream unavailable', { status: 503 });
			}
			return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
		};

		const unauthorizedTools = await listMcpTools(listToolsEvent());
		expect(unauthorizedTools.status).toBe(401);

		const toolsResponse = await listMcpTools(listToolsEvent('mcp-test-token'));
		expect(toolsResponse.status).toBe(200);
		const toolsPayload = (await toolsResponse.json()) as {
			tools: Array<{ name: string }>;
			traceId: string;
		};
		expect(toolsPayload.traceId.startsWith('trace-')).toBe(true);
		expect(toolsPayload.tools.map((tool) => tool.name)).toContain('generate_ruleset');

		const generateResponse = await callMcpTool(
			callToolEvent(
				{
					tool: 'generate_ruleset',
					args: {
						source: {
							type: 'text',
							text: 'Simple game. 2 players. Draw from stock then discard.'
						},
						model_source: 'server'
					}
				},
				'mcp-test-token',
				fetchImpl
			)
		);
		expect(generateResponse.status).toBe(200);
		const generated = (await generateResponse.json()) as {
			result: { ruleset: { id: string; name: string } };
			traceId: string;
		};
		expect(generated.traceId.startsWith('trace-')).toBe(true);
		expect(generated.result.ruleset.id).toContain('ruleset-');

		const resourcesResponse = await listMcpResources(
			listResourcesEvent(`?uri=just-cards://rulesets/${generated.result.ruleset.id}`, 'mcp-test-token')
		);
		expect(resourcesResponse.status).toBe(200);
		const resourcesPayload = (await resourcesResponse.json()) as {
			resource: { uri: string; json?: { id?: string } };
		};
		expect(resourcesPayload.resource.uri).toContain(`rulesets/${generated.result.ruleset.id}`);
		expect(resourcesPayload.resource.json?.id).toBe(generated.result.ruleset.id);
	});
});
