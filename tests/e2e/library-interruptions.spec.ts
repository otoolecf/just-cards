import { test, expect, type Page } from '@playwright/test';
import type { RoomView } from '../../src/lib/server/room-service';
async function view(page: Page): Promise<RoomView> {
	const code = await page.getByTestId('room-code').innerText();
	const token = await page.evaluate(
		(code) => localStorage.getItem(`jc-seat-${code}`),
		code,
	);
	return (
		await page.request.get(`/api/rooms/${code}`, {
			headers: { authorization: `Bearer ${token}` },
		})
	).json();
}
async function act(page: Page, input: object): Promise<RoomView> {
	const state = await view(page),
		token = await page.evaluate(
			(code) => localStorage.getItem(`jc-seat-${code}`),
			state.code,
		);
	const res = await page.request.post(`/api/rooms/${state.code}`, {
		headers: { authorization: `Bearer ${token}` },
		data: {
			...input,
			revision: state.revision,
			requestId: crypto.randomUUID(),
		},
	});
	expect(res.ok(), await res.text()).toBe(true);
	return res.json();
}
async function start(host: Page, guest: Page, game = 'builtin-six-card-golf') {
	await host.goto('/play');
	await host.waitForLoadState('networkidle');
	await host.getByLabel('Game', { exact: true }).selectOption(game);
	await host.getByLabel('Your name', { exact: true }).fill('Host');
	await host.getByRole('button', { name: 'Create room', exact: true }).click();
	await expect(host.getByTestId('room-code')).toBeVisible();
	await guest.goto(host.url());
	await guest.getByLabel('Your name', { exact: true }).fill('Guest');
	await guest.getByRole('button', { name: 'Join room', exact: true }).click();
	await expect(host.getByText('Guest', { exact: true })).toBeVisible();
	await host.getByRole('button', { name: 'Deal cards', exact: true }).click();
	await expect(guest.getByTestId('my-hand')).toBeVisible();
}
test('organize games in both pickers without changing a room snapshot', async ({
	page,
	request,
}) => {
	const key=process.env.E2E_OWNER_ACCESS_KEY;
	test.skip(!key, 'Shared-library management requires the test owner key');
	expect((await page.request.post('/api/owner/session',{data:{key}})).ok()).toBe(true);
	const title = `Library ${crypto.randomUUID().slice(0, 8)}`;
	await page.goto('/play');
	await page.waitForLoadState('networkidle');
	await page.getByText('Manage games', { exact: true }).click();
	const builtin = page.getByRole('region', {
		name: 'Six Card Golf',
		exact: true,
	});
	await builtin.getByRole('button', { name: 'Duplicate', exact: true }).click();
	await builtin.getByLabel('Copy name').fill(title);
	await builtin.getByRole('button', { name: 'Save copy' }).click();
	const card = page.getByRole('region', { name: title, exact: true });
	await expect(card).toBeVisible();
	await card.getByRole('button', { name: '☆ Favorite', exact: true }).click();
	const records = await (await request.get('/api/rulesets')).json();
	const copy = records.rulesets.find((r: { name: string }) => r.name === title);
	const token = crypto.randomUUID();
	const room = await (
		await request.post('/api/rooms', {
			headers: { authorization: `Bearer ${token}` },
			data: { name: 'Host', rulesetId: copy.id },
		})
	).json();
	await card.getByRole('button', { name: 'Rename', exact: true }).click();
	await card.getByLabel('Game name').fill(title + ' renamed');
	await card.getByRole('button', { name: 'Save name' }).click();
	const renamed = page.getByRole('region', {
		name: title + ' renamed',
		exact: true,
	});
	await renamed.getByRole('button', { name: 'Remove from list', exact: true }).click();
	await expect(
		page
			.getByLabel('Game', { exact: true })
			.locator(`option[value="${copy.id}"]`),
	).toHaveCount(0);
	await page.getByLabel('Show archived games').check();
	await renamed.getByRole('button', { name: 'Restore', exact: true }).click();
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(
		page.getByLabel('Game', { exact: true }).locator('option').first(),
	).toHaveAttribute('value', copy.id);
	await page.getByText('Manage games', { exact: true }).click();
	await expect(
		page
			.getByRole('region', { name: title + ' renamed', exact: true })
			.getByRole('button', { name: '★ Unfavorite', exact: true }),
	).toBeVisible();
	expect(
		(
			await (
				await request.get(`/api/rooms/${room.code}`, {
					headers: { authorization: `Bearer ${token}` },
				})
			).json()
		).name,
	).toBe(title);
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.getByText('Manage games', { exact: true }).click();
	await expect(
		page.getByRole('region', { name: title + ' renamed', exact: true }),
	).toBeVisible();
});
test('pause, undo, private replacement, revoked old phone and host transfer', async ({
	browser,
}) => {
	const a = await browser.newContext(),
		b = await browser.newContext(),
		c = await browser.newContext();
	const host = await a.newPage(),
		guest = await b.newPage(),
		replacement = await c.newPage();
	await start(host, guest, 'builtin-500-rum');
	const before = await view(guest);
	const url = host.url();
	await guest.getByRole('button', { name: /Draw from stock/ }).click();
	await host.getByText('Table controls', { exact: true }).click();
	await host
		.getByRole('button', { name: 'Undo last play', exact: true })
		.click();
	await host.getByRole('button', { name: 'Confirm undo' }).click();
	await expect
		.poll(async () => (await view(guest)).table)
		.toEqual(before.table);
	await host.getByRole('button', { name: 'Pause game', exact: true }).click();
	await expect(
		guest.getByRole('heading', { name: 'Game paused' }),
	).toBeVisible();
	await expect(
		guest.getByRole('button', { name: /Draw from stock/ }),
	).toBeDisabled();
	await host
		.getByRole('button', { name: 'Replacement link for Guest' })
		.click();
	const link = await host.getByLabel('Private link for Guest').inputValue();
	await replacement.goto(link);
	await expect(
		replacement.getByRole('heading', { name: 'Recover a seat' }),
	).toBeVisible();
	expect(replacement.url()).not.toContain('#');
	await replacement
		.getByLabel("Replacement player's name (optional)")
		.fill('New Guest');
	await replacement
		.getByRole('button', { name: 'Recover my seat', exact: true })
		.click();
	await expect(replacement.getByTestId('my-hand')).toBeVisible();
	const recovered = await view(replacement);
	expect(recovered.selfId).toBe(before.selfId);
	expect(recovered.table).toEqual(before.table);
	await expect(guest.getByTestId('my-hand')).toHaveCount(0);
	await host.getByRole('button', { name: 'Resume game', exact: true }).click();
	await expect(
		replacement.getByRole('button', { name: /Draw from stock/ }),
	).toBeEnabled();
	await host
		.getByRole('button', { name: 'Make New Guest host', exact: true })
		.click();
	await expect(
		replacement.getByRole('button', { name: 'End game', exact: true }),
	).toBeVisible();
	await replacement.reload();
	await expect(replacement.getByTestId('my-hand')).toBeVisible();
	expect((await view(replacement)).selfId).toBe(before.selfId);
	const extra = await browser.newContext(),
		reuse = await extra.newPage();
	await reuse.goto(link);
	await reuse
		.getByRole('button', { name: 'Recover my seat', exact: true })
		.click();
	await expect(reuse.getByRole('alert')).toContainText('already used');
	await host.getByRole('button', { name: 'Step away', exact: true }).click();
	await expect(host).toHaveURL(/\/play$/);
	await expect(
		replacement.getByRole('heading', { name: 'Game paused' }),
	).toBeVisible();
	await host.goto(url);
	await host.getByRole('button', { name: "I'm back", exact: true }).click();
	await replacement
		.getByRole('button', { name: 'Resume game', exact: true })
		.click();
	await a.close();
	await b.close();
	await c.close();
	await extra.close();
});
test('joins between rounds and deals the new roster without changing scores', async ({
	browser,
}) => {
	const a = await browser.newContext(),
		b = await browser.newContext(),
		c = await browser.newContext();
	const host = await a.newPage(),
		guest = await b.newPage(),
		newcomer = await c.newPage();
	await start(host, guest);
	await newcomer.goto(host.url());
	await expect(
		newcomer.getByRole('button', { name: 'Join room', exact: true }),
	).toHaveCount(0);
	for (const page of [host, guest])
		for (const slot of [0, 1])
			await act(page, { type: 'command', command: { type: 'reveal', slot } });
	for (let slot = 2; slot < 6; slot++) {
		await act(guest, {
			type: 'command',
			command: { type: 'draw', source: 'stock' },
		});
		await act(guest, { type: 'command', command: { type: 'swap', slot } });
		if (slot < 5) {
			await act(host, {
				type: 'command',
				command: { type: 'draw', source: 'stock' },
			});
			await act(host, { type: 'command', command: { type: 'discard' } });
		}
	}
	const previous = (await view(host)).table!.scores;
	await expect(
		newcomer.getByRole('button', { name: 'Join room', exact: true }),
	).toBeVisible();
	await newcomer.getByLabel('Your name', { exact: true }).fill('Late player');
	await newcomer
		.getByRole('button', { name: 'Join room', exact: true })
		.click();
	await expect(
		newcomer.getByRole('heading', { name: 'Round scores', exact: true }),
	).toBeVisible();
	await expect(
		host.getByText('Late player', { exact: true }).first(),
	).toBeVisible();
	await host
		.getByRole('button', { name: 'Deal next round', exact: true })
		.click();
	await expect.poll(async () => (await view(newcomer)).table?.round).toBe(2);
	const after = await view(newcomer);
	expect(after.table!.hands[after.selfId!]).toHaveLength(6);
	expect(after.table!.totals[after.selfId!]).toBe(0);
	expect(after.table!.scores).toEqual(previous);
	await a.close();
	await b.close();
	await c.close();
});
test('a disconnected host triggers pause and a present player can take over', async ({
	browser,
}) => {
	test.skip(process.env.CF_INTEGRATION !== '1', 'Worker presence alarm');
	test.setTimeout(70000);
	const a = await browser.newContext(),
		b = await browser.newContext();
	const host = await a.newPage(),
		guest = await b.newPage();
	await start(host, guest);
	await a.close();
	await expect(guest.getByRole('heading', { name: 'Game paused' })).toBeVisible(
		{ timeout: 50000 },
	);
	await guest.getByRole('button', { name: 'Take over as host' }).click();
	await expect(
		guest.getByRole('button', { name: 'End game', exact: true }),
	).toBeVisible();
	await guest.getByText('Table controls', { exact: true }).click();
	await expect(
		guest.getByRole('button', { name: 'Replacement link for Host' }),
	).toBeEnabled();
	await b.close();
});
