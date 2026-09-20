import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizeMcpRequest } from '$lib/mcp/auth';
import { createFastMcpEdgeServer } from '$lib/mcp/fastmcp-server';

export async function _handleFastMcpRequest(request: Request, fetchImpl?: typeof fetch, platform?: App.Platform): Promise<Response> {
	const auth = await authorizeMcpRequest(request, { fetchImpl });
	if (!auth.ok) {
		return json(
			{
				error: auth.error,
				error_description: auth.errorDescription
			},
			{ status: auth.status, headers: auth.headers }
		);
	}

	const server = await createFastMcpEdgeServer({ fetchImpl, platform });
	return server.fetch(request);
}

export const GET: RequestHandler = async ({ request, fetch, platform }) => {
	return _handleFastMcpRequest(request, fetch, platform);
};

export const POST: RequestHandler = async ({ request, fetch, platform }) => {
	return _handleFastMcpRequest(request, fetch, platform);
};

export const DELETE: RequestHandler = async ({ request, fetch, platform }) => {
	return _handleFastMcpRequest(request, fetch, platform);
};

export const OPTIONS: RequestHandler = async ({ request, fetch, platform }) => {
	return _handleFastMcpRequest(request, fetch, platform);
};
