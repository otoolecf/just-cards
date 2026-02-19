import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorizeMcpRequest } from '$lib/mcp/auth';
import { openMcpSseSession } from '$lib/mcp/sse-transport';

export const GET: RequestHandler = async ({ request, url, fetch }) => {
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

	const endpointBase = `${url.origin}/api/mcp/messages`;
	const { response } = openMcpSseSession(endpointBase);
	return response;
};
