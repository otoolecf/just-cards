import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizeMcpRequest } from '$lib/mcp/auth';
import { getDefaultMcpServer } from '$lib/mcp/default-server';
import { handleMcpJsonRpc } from '$lib/mcp/jsonrpc';
import { hasMcpSseSession, sendMcpSseMessage } from '$lib/mcp/sse-transport';

function randomTraceId(): string {
	return `trace-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export const POST: RequestHandler = async ({ request, url, fetch }) => {
	const auth = await authorizeMcpRequest(request, { fetchImpl: fetch });
	if (!auth.ok) {
		return json(
			{
				error: auth.error,
				error_description: auth.errorDescription
			},
			{ status: auth.status, headers: auth.headers }
		);
	}

	const sessionId = url.searchParams.get('sessionId')?.trim();
	if (!sessionId) {
		return json({ error: 'sessionId query parameter is required' }, { status: 400 });
	}
	if (!hasMcpSseSession(sessionId)) {
		return json({ error: 'unknown mcp session' }, { status: 404 });
	}

	const body = await request.json().catch(() => null);
	const server = await getDefaultMcpServer({ fetchImpl: fetch });
	const traceId = request.headers.get('x-trace-id')?.trim() || randomTraceId();
	const response = await handleMcpJsonRpc(server, body, { traceId });

	if (response) {
		sendMcpSseMessage(sessionId, response);
	}

	return new Response(null, { status: 202 });
};
