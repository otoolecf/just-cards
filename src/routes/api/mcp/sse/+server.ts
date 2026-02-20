import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const redirectUrl = new URL(url.toString());
	redirectUrl.pathname = '/api/mcp';
	redirectUrl.search = '';
	return new Response(null, {
		status: 307,
		headers: {
			location: redirectUrl.toString()
		}
	});
};
