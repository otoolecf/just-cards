import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { _handleFastMcpRequest } from '../+server';

export const POST: RequestHandler = async ({ request, url, fetch }) => {
	const sessionId = url.searchParams.get('sessionId')?.trim();
	if (!sessionId) {
		return json({ error: 'sessionId query parameter is required' }, { status: 400 });
	}
	return _handleFastMcpRequest(request, fetch);
};
