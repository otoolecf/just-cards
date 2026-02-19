import { beforeEach, describe, expect, it } from 'vitest';
import { resetDefaultRulesetServiceForTests } from '$lib/rulesets/default-service';
import { resetMcpSseSessionsForTests } from './sse-transport';
import { GET as openSseStream } from '../../routes/api/mcp/sse/+server';
import { POST as postSseMessage } from '../../routes/api/mcp/messages/+server';
import { GET as getProtectedResourceMetadata } from '../../routes/.well-known/oauth-protected-resource/+server';

function authHeaders(token = 'mcp-test-token'): Record<string, string> {
	return {
		authorization: `Bearer ${token}`,
		'content-type': 'application/json'
	};
}

function sseEvent(token = 'mcp-test-token'): Parameters<typeof openSseStream>[0] {
	return {
		params: {},
		request: new Request('http://localhost/api/mcp/sse', {
			method: 'GET',
			headers: authHeaders(token)
		}),
		url: new URL('http://localhost/api/mcp/sse')
	} as Parameters<typeof openSseStream>[0];
}

function messagesEvent(sessionId: string, body: unknown, token = 'mcp-test-token'): Parameters<typeof postSseMessage>[0] {
	return {
		params: {},
		request: new Request(`http://localhost/api/mcp/messages?sessionId=${encodeURIComponent(sessionId)}`, {
			method: 'POST',
			headers: authHeaders(token),
			body: JSON.stringify(body)
		}),
		url: new URL(`http://localhost/api/mcp/messages?sessionId=${encodeURIComponent(sessionId)}`)
	} as Parameters<typeof postSseMessage>[0];
}

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
	const result = await Promise.race([
		reader.read(),
		new Promise<never>((_, reject) => {
			setTimeout(() => reject(new Error('timed out waiting for SSE chunk')), 2500);
		})
	]);
	if (result.done) {
		return '';
	}
	return new TextDecoder().decode(result.value);
}

describe('mcp sse api', () => {
	beforeEach(() => {
		resetDefaultRulesetServiceForTests();
		resetMcpSseSessionsForTests();
		process.env.RULESET_STORE_DRIVER = 'memory';
		process.env.JUST_CARDS_MCP_AUTH_TOKEN = 'mcp-test-token';
		delete process.env.JUST_CARDS_MCP_OAUTH_ISSUER;
		delete process.env.JUST_CARDS_MCP_OAUTH_JWKS_URL;
		delete process.env.JUST_CARDS_MCP_OAUTH_AUDIENCE;
		delete process.env.JUST_CARDS_MCP_OAUTH_REQUIRED_SCOPES;
	});

	it('mcp_sse_session_establish_and_tools_list_roundtrip', async () => {
		const streamResponse = await openSseStream(sseEvent());
		expect(streamResponse.status).toBe(200);
		expect(streamResponse.headers.get('content-type') ?? '').toContain('text/event-stream');

		const reader = streamResponse.body?.getReader();
		expect(reader).toBeDefined();
		if (!reader) {
			return;
		}

		const initialChunk = await readChunk(reader);
		expect(initialChunk).toContain('event: endpoint');
		const sessionIdMatch = initialChunk.match(/sessionId=([a-zA-Z0-9-]+)/);
		expect(sessionIdMatch).toBeTruthy();
		if (!sessionIdMatch) {
			return;
		}
		const sessionId = sessionIdMatch[1];

		const postResponse = await postSseMessage(
			messagesEvent(sessionId, {
				jsonrpc: '2.0',
				id: 'tool-list-1',
				method: 'tools/list',
				params: {}
			})
		);
		expect(postResponse.status).toBe(202);

		let messageChunk = '';
		for (let i = 0; i < 4; i += 1) {
			messageChunk += await readChunk(reader);
			if (messageChunk.includes('tool-list-1')) {
				break;
			}
		}
		expect(messageChunk).toContain('event: message');
		expect(messageChunk).toContain('tool-list-1');
		expect(messageChunk).toContain('generate_ruleset');

		await reader.cancel();
	});

	it('mcp_oauth_protected_resource_metadata_exposes_server_expectations', async () => {
		process.env.JUST_CARDS_MCP_OAUTH_ISSUER = 'https://issuer.example';
		process.env.JUST_CARDS_MCP_OAUTH_REQUIRED_SCOPES = 'mcp:tools mcp:resources';

		const response = await getProtectedResourceMetadata({
			params: {},
			request: new Request('http://localhost/.well-known/oauth-protected-resource', { method: 'GET' }),
			url: new URL('http://localhost/.well-known/oauth-protected-resource')
		} as Parameters<typeof getProtectedResourceMetadata>[0]);
		expect(response.status).toBe(200);
		const payload = (await response.json()) as {
			resource: string;
			authorization_servers?: string[];
			scopes_supported?: string[];
		};
		expect(payload.resource).toBe('http://localhost/api/mcp');
		expect(payload.authorization_servers).toEqual(['https://issuer.example']);
		expect(payload.scopes_supported).toEqual(['mcp:tools', 'mcp:resources']);
	});
});
