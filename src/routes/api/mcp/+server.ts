import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizeMcpRequest } from '$lib/mcp/auth';
import { createFastMcpEdgeServer } from '$lib/mcp/fastmcp-server';

export async function _handleFastMcpRequest(request: Request, fetchImpl?: typeof fetch): Promise<Response> {
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

	const server = await createFastMcpEdgeServer({ fetchImpl });
	return server.fetch(request);
}

export const GET: RequestHandler = async ({ request, fetch }) => {
	return _handleFastMcpRequest(request, fetch);
};

export const POST: RequestHandler = async ({ request, fetch }) => {
	return _handleFastMcpRequest(request, fetch);
};

export const DELETE: RequestHandler = async ({ request, fetch }) => {
	return _handleFastMcpRequest(request, fetch);
};

export const OPTIONS: RequestHandler = async ({ request, fetch }) => {
	return _handleFastMcpRequest(request, fetch);
};
