import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDefaultMcpServer } from '$lib/mcp/default-server';
import { getMcpAuthToken, isAuthorizedMcpRequest } from '$lib/mcp/auth';

function randomTraceId(): string {
	return `trace-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export const GET: RequestHandler = async ({ request, url, fetch }) => {
	const token = getMcpAuthToken();
	if (!isAuthorizedMcpRequest(request, token)) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const traceId = randomTraceId();
	const server = await getDefaultMcpServer({ fetchImpl: fetch });
	const uri = url.searchParams.get('uri')?.trim();

	try {
		if (uri) {
			const resource = await server.readResource(uri);
			return json({ traceId, resource });
		}

		const resources = await server.listResources();
		return json({ traceId, resources });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'unable to read MCP resources';
		return json({ traceId, error: message }, { status: 400 });
	}
};
