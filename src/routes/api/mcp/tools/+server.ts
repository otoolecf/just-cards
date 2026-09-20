import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDefaultMcpServer } from '$lib/mcp/default-server';
import { authorizeMcpRequest } from '$lib/mcp/auth';

function randomTraceId(): string {
	return `trace-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export const GET: RequestHandler = async ({ request, fetch, platform }) => {
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

	const traceId = randomTraceId();
	const server = await getDefaultMcpServer({ fetchImpl: fetch, platform });
	return json({
		traceId,
		tools: server.listTools()
	});
};
