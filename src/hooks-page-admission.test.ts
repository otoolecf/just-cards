import { describe, expect, it, vi } from 'vitest';
vi.mock('$lib/server/owner-config', () => ({ ownerKey: () => undefined }));
vi.mock('$app/environment', () => ({ dev: false }));
import { handle } from './hooks.server';
import { GET as sitemapGet } from './routes/sitemap.xml/+server';
import { load as homeLoad } from './routes/+page.server';
import { load as playLoad } from './routes/play/+page.server';
import { load as rulesetLoad } from './routes/play/[rulesetId]/+page.server';

const pages = [
	['/', '/', 'GET'],
	['/', '/__data.json', 'GET'],
	['/play', '/play', 'GET'],
	['/play', '/play/__data.json', 'GET'],
	['/play', '/%70lay/__data.json', 'GET'],
	['/play/[rulesetId]', '/play/audit-ruleset', 'GET'],
	['/play/[rulesetId]', '/play/audit-ruleset/__data.json', 'GET'],
	['/play/[rulesetId]', '/play/audit-ruleset', 'HEAD'],
	['/sitemap.xml', '/sitemap.xml', 'GET'],
	['/sitemap.xml', '/sitemap.xml', 'HEAD'],
	['/sitemap.xml', '/%73itemap.xml', 'GET'],
	['/sitemap.xml', '/sitemap.xml?cache=miss', 'GET']
] as const;

function request(
	route: string | null,
	path: string,
	method = 'GET',
	allowed = false
) {
	const limit = vi.fn(async () => ({ success: allowed }));
	const prepare = vi.fn(() => ({
		all: async () => ({ results: [] }),
		bind: () => ({ first: async () => null, all: async () => ({ results: [] }) })
	}));
	const platform = {
		env: { API_RATE_LIMIT: { limit }, RULESETS_DB: { prepare } }
	};
	const resolve = vi.fn(async () => {
		const event = { platform, params: { rulesetId: 'audit-ruleset' } };
		if (route === '/sitemap.xml')
			return sitemapGet(event as unknown as Parameters<typeof sitemapGet>[0]);
		if (route === '/')
			await homeLoad(event as unknown as Parameters<typeof homeLoad>[0]);
		if (route === '/play')
			await playLoad(event as unknown as Parameters<typeof playLoad>[0]);
		if (route === '/play/[rulesetId]')
			await rulesetLoad(event as unknown as Parameters<typeof rulesetLoad>[0]);
		return new Response('loaded');
	});
	const args = {
		event: {
			route: { id: route },
			url: new URL(path, 'https://example.com'),
			request: new Request(new URL(path, 'https://example.com'), { method }),
			platform,
			getClientAddress: () => '192.0.2.1'
		},
		resolve
	} as unknown as Parameters<typeof handle>[0];
	return { args, limit, prepare, resolve };
}

describe('database page admission', () => {
	it.each(pages)(
		'rejects %s %s %s before any database query',
		async (route, path, method) => {
			const r = request(route, path, method);
			const response = await handle(r.args);
			expect(response.status).toBe(429);
			expect(response.headers.get('retry-after')).toBe('60');
			expect(r.limit).toHaveBeenCalledWith({ key: '192.0.2.1' });
			expect(r.resolve).not.toHaveBeenCalled();
			expect(r.prepare).not.toHaveBeenCalled();
		}
	);
	it.each(['/', '/play', '/play/[rulesetId]', '/sitemap.xml'])(
		'fails closed for %s without its binding',
		async (route) => {
			const r = request(route, '/play');
			delete (r.args.event.platform!.env as Partial<Env>).API_RATE_LIMIT;
			expect((await handle(r.args)).status).toBe(503);
			expect(r.prepare).not.toHaveBeenCalled();
		}
	);
	it.each(['/', '/play'])(
		'allows admitted %s reads normally',
		async (route) => {
			const r = request(route, route, 'GET', true);
			expect((await handle(r.args)).status).toBe(200);
			expect(r.limit).toHaveBeenCalledTimes(1);
			expect(r.prepare).toHaveBeenCalledTimes(1);
		}
	);
	it.each(['GET', 'HEAD'])('allows admitted sitemap %s requests', async (method) => {
		const r = request('/sitemap.xml', '/sitemap.xml', method, true);
		const response = await handle(r.args);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('application/xml');
		expect(await response.text()).toContain('<urlset');
		expect(r.limit).toHaveBeenCalledTimes(1);
		expect(r.prepare).toHaveBeenCalledTimes(1);
	});
	it.each(['/play', '/sitemap.xml'])('shares the API budget with %s', async (route) => {
		const api = request('/api/rulesets', '/api/rulesets', 'GET', true);
		api.limit
			.mockResolvedValueOnce({ success: true })
			.mockResolvedValue({ success: false });
		expect((await handle(api.args)).status).toBe(200);
		const page = request(route, route);
		page.args.event.platform!.env.API_RATE_LIMIT =
			api.args.event.platform!.env.API_RATE_LIMIT;
		expect((await handle(page.args)).status).toBe(429);
		expect(api.limit.mock.calls).toEqual([
			[{ key: '192.0.2.1' }],
			[{ key: '192.0.2.1' }]
		]);
		expect(page.prepare).not.toHaveBeenCalled();
	});
	it.each(['/icon-192.png', '/robots.txt'])('leaves %s outside database admission', async (path) => {
		const r = request(null, path);
		expect((await handle(r.args)).status).toBe(200);
		expect(r.limit).not.toHaveBeenCalled();
	});
});
