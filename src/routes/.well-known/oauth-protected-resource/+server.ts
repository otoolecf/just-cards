import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMcpProtectedResourceMetadata } from '$lib/mcp/auth';

export const GET: RequestHandler = ({ url }) => {
	return json(getMcpProtectedResourceMetadata(url.origin));
};
