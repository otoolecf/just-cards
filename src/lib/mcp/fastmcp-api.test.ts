import { beforeEach, describe, expect, it } from 'vitest';
import { resetDefaultRulesetServiceForTests } from '$lib/rulesets/default-service';
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

describe('fastmcp api', () => {
	beforeEach(() => {
		resetDefaultRulesetServiceForTests();
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
});
