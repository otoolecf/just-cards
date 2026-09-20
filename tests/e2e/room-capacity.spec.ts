import { test, expect, type APIRequestContext } from '@playwright/test';
import type { RoomView } from '../../src/lib/server/room-service';
// Run against a fresh Wrangler database with capacity 2, lobby/game idle 6 seconds,
// 4 creations/hour, and the non-secret OWNER_ACCESS_KEY below. See docs/public-rooms.md.
test.skip(
	process.env.ROOM_CAPACITY_E2E !== '1',
	'Requires dedicated capacity-test Worker',
);
const key = 'capacity-test-owner-key-not-a-production-secret';
async function create(request: APIRequestContext, token: string) {
	return request.post('/api/rooms', {
		headers: { authorization: `Bearer ${token}` },
		data: { name: 'Host', rulesetId: 'builtin-solitaire' },
	});
}
async function read(
	request: APIRequestContext,
	code: string,
	token: string,
): Promise<RoomView> {
	return (
		await request.get(`/api/rooms/${code}`, {
			headers: { authorization: `Bearer ${token}` },
		})
	).json();
}
async function act(
	request: APIRequestContext,
	room: RoomView,
	token: string,
	type: string,
) {
	return request.post(`/api/rooms/${room.code}`, {
		headers: { authorization: `Bearer ${token}` },
		data: { type, revision: room.revision, requestId: crypto.randomUUID() },
	});
}
test('global admission, idle save, phone reconnect, and owner boundary', async ({
	browser,
	request,
}) => {
	test.setTimeout(90000);
	const tokens = Array.from({ length: 8 }, () => crypto.randomUUID());
	const responses = await Promise.all(
		tokens.map((token) => create(request, token)),
	);
	expect(responses.filter((r) => r.ok())).toHaveLength(2);
	for (const r of responses.filter((r) => !r.ok())) {
		expect(r.status()).toBe(503);
		expect(r.headers()['retry-after']).toBe('30');
	}
	const winners = await Promise.all(
		responses.flatMap((r, i) =>
			r.ok()
				? [
						r
							.json()
							.then((room) => ({ room: room as RoomView, token: tokens[i] })),
					]
				: [],
		),
	);
	const [a] = winners;
	const ctx = await browser.newContext({
			viewport: { width: 390, height: 844 },
		}),
		page = await ctx.newPage();
	await page.goto('/play');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Your name', { exact: true }).fill('New player');
	await page.getByRole('button', { name: 'Create room', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText(
		'All tables are currently occupied',
	);
	// Accepted deal starts the longer game lifecycle. Own cards remain identical after idle/resume.
	expect(
		(
			await act(
				request,
				await read(request, a.room.code, a.token),
				a.token,
				'start',
			)
		).ok(),
	).toBe(true);
	const dealt = await read(request, a.room.code, a.token);
	await page.evaluate(
		({ code, token }) => localStorage.setItem(`jc-seat-${code}`, token),
		{ code: a.room.code, token: a.token },
	);
	await page.goto(`/play/room/${a.room.code}`);
	await expect(page.getByText('Live', { exact: true })).toBeVisible();
	await expect(
		page.getByRole('heading', { name: 'Table saved', exact: true }),
	).toBeVisible({ timeout: 12000 });
	const saved = await read(request, a.room.code, a.token);
	expect(saved.sleeping).toBe(true);
	expect(saved.table).toEqual(dealt.table);
	let polling = 0;
	page.on('request', (r) => {
		if (r.url().endsWith(`/api/rooms/${a.room.code}`)) polling++;
	});
	await page.waitForTimeout(2500);
	expect(polling).toBe(0);
	// Both old leases expired. Fill the two slots, verify resume is denied without changing cards.
	const c = (await (await create(request, tokens[6])).json()) as RoomView;
	const d = (await (await create(request, tokens[7])).json()) as RoomView;
	expect(c.code).toBeTruthy();
	expect(d.code).toBeTruthy();
	await page.getByRole('button', { name: 'Resume game', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText(
		'All tables are currently occupied',
	);
	expect((await read(request, a.room.code, a.token)).table).toEqual(
		dealt.table,
	);
	expect(
		(
			await act(
				request,
				await read(request, c.code, tokens[6]),
				tokens[6],
				'end_game',
			)
		).ok(),
	).toBe(true);
	await page.getByRole('button', { name: 'Resume game', exact: true }).click();
	await expect(page.getByText('Live', { exact: true })).toBeVisible();
	expect((await read(request, a.room.code, a.token)).sleeping).toBe(false);
	expect((await read(request, a.room.code, a.token)).table).toEqual(
		dealt.table,
	);
	// Four successful creations exhaust this network's window, even after a slot is released.
	const limited = await create(request, crypto.randomUUID());
	expect(limited.status()).toBe(429);
	await act(
		request,
		await read(request, a.room.code, a.token),
		a.token,
		'end_game',
	);
	await act(
		request,
		await read(request, d.code, tokens[7]),
		tokens[7],
		'end_game',
	);
	await ctx.close();
	// Owner gate applies before request parsing / source fetch / provider spend on every transport.
	for (const path of [
		'/api/rulesets/generate',
		'/api/rulesets/%67enerate',
		'/api/mcp',
		'/api/mcp/call',
		'/api/mcp/messages',
		'/api/chat/actions',
	]) {
		const denied = await request.post(path, {
			headers: { authorization: `Bearer ${a.token}` },
			data: {},
		});
		expect(denied.status()).toBe(403);
	}
	const owner = await browser.newContext(),
		ownerPage = await owner.newPage();
	await ownerPage.goto('/owner');
	await ownerPage.getByLabel('Owner key').fill(key);
	await ownerPage.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(ownerPage.getByRole('status')).toContainText('Signed in');
	const cookie = (await owner.cookies()).find((c) => c.name === 'jc_owner')!;
	expect(cookie.httpOnly).toBe(true);
	expect(cookie.sameSite).toBe('Strict');
	expect(
		(await owner.request.get('/api/owner/session').then((r) => r.json())).owner,
	).toBe(true);
	// Missing source returns input validation (400), proving the owner reached the handler without AI calls.
	expect(
		(await owner.request.post('/api/rulesets/generate', { data: {} })).status(),
	).toBe(400);
	await ownerPage
		.getByRole('button', { name: 'Sign out', exact: true })
		.click();
	await expect(ownerPage.getByLabel('Owner key')).toBeVisible();
	expect(
		(await owner.request.post('/api/rulesets/generate', { data: {} })).status(),
	).toBe(403);
	await owner.close();
});
