import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDefaultMcpServer } from '$lib/mcp/default-server';
import { getMcpAuthToken, isAuthorizedMcpRequest } from '$lib/mcp/auth';

function randomTraceId(): string {
	return `trace-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export const GET: RequestHandler = async ({ request, fetch }) => {
	const token = getMcpAuthToken();
	if (!isAuthorizedMcpRequest(request, token)) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const traceId = randomTraceId();
	const server = await getDefaultMcpServer({ fetchImpl: fetch });
	return json({
		traceId,
		tools: server.listTools()
	});
};
