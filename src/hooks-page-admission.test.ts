import { describe, expect, it, vi } from 'vitest';
vi.mock('$lib/server/owner-config', () => ({ ownerKey: () => undefined }));
vi.mock('$app/environment', () => ({ dev: false }));
import { handle } from './hooks.server';
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
	['/play/[rulesetId]', '/play/audit-ruleset', 'HEAD']
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
		bind: () => ({ first: async () => null })
	}));
	const platform = {
		env: { API_RATE_LIMIT: { limit }, RULESETS_DB: { prepare } }
	};
	const resolve = vi.fn(async () => {
		const event = { platform, params: { rulesetId: 'audit-ruleset' } };
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
	it.each(['/', '/play', '/play/[rulesetId]'])(
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
	it('shares the API budget with database pages', async () => {
		const api = request('/api/rulesets', '/api/rulesets', 'GET', true);
		api.limit
			.mockResolvedValueOnce({ success: true })
			.mockResolvedValue({ success: false });
		expect((await handle(api.args)).status).toBe(200);
		const page = request('/play', '/play');
		page.args.event.platform!.env.API_RATE_LIMIT =
			api.args.event.platform!.env.API_RATE_LIMIT;
		expect((await handle(page.args)).status).toBe(429);
		expect(api.limit.mock.calls).toEqual([
			[{ key: '192.0.2.1' }],
			[{ key: '192.0.2.1' }]
		]);
		expect(page.prepare).not.toHaveBeenCalled();
	});
	it('leaves static assets outside database admission', async () => {
		const r = request(null, '/icon-192.png');
		expect((await handle(r.args)).status).toBe(200);
		expect(r.limit).not.toHaveBeenCalled();
	});
});
