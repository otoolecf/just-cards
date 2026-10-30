import { signInOwner } from './owner';
import { test, expect } from '@playwright/test';

test('physical scores survive offline creation, undo/redo, reload and reconnect', async ({
	page,
	context,
	request,
}) => {
	test.skip(
		process.env.CF_INTEGRATION !== '1',
		'Offline shell requires a production build',
	);
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
	});
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect
		.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
		.toBe(true);
	await context.setOffline(true);
	await page.getByPlaceholder('Player 1').fill('Offline Pat');
	await page.getByPlaceholder('Player 2').fill('Offline Sam');
	await page
		.getByRole('button', { name: 'Create session', exact: true })
		.click();
	await expect(page.getByLabel('Score sync status')).toContainText('offline');
	await page.getByText('Manual points', { exact: true }).click();
	await page
		.getByRole('spinbutton', { name: 'Offline Pat', exact: true })
		.fill('12');
	await page
		.getByRole('spinbutton', { name: 'Offline Sam', exact: true })
		.fill('-2');
	await page.getByRole('button', { name: 'Add round', exact: true }).click();
	await expect(page.locator('.session-summary')).toContainText('Events: 1');
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect(page.locator('.session-summary')).toContainText('Events: 3');
	await page.reload();
	await expect(page.getByLabel('Score sync status')).toContainText(
		'3 score changes',
	);
	await expect(page.locator('.session-summary')).toContainText('Events: 3');
	const id = await page.evaluate(() =>
		localStorage.getItem('jc-score-session'),
	);
	await context.setOffline(false);
	await expect(page.getByLabel('Score sync status')).toContainText(
		'Saved and synced',
		{ timeout: 15000 },
	);
	const state = await (await request.get(`/api/sessions/${id}`)).json();
	expect(state.eventCount).toBe(3);
	expect(state.state.totalsByPlayer).toEqual({
		'Offline Pat': 12,
		'Offline Sam': -2,
	});
	await page.reload();
	await expect(page.getByLabel('Score sync status')).toContainText(
		'Saved and synced',
	);
	const again = await (await request.get(`/api/sessions/${id}`)).json();
	expect(again.eventCount).toBe(3);
	const cached = await page.evaluate(async () => {
		const urls: string[] = [];
		for (const key of await caches.keys())
			for (const request of await (await caches.open(key)).keys())
				urls.push(new URL(request.url).pathname);
		return urls;
	});
	expect(
		cached.some(
			(path) => path.startsWith('/api/') || path.startsWith('/play/room'),
		),
	).toBe(false);
});

test('a saved ten-card house variant drives shared room setup', async ({
	page,
	request,
}) => {
	await signInOwner(page.request);
	await page.goto('/play');
	await page.waitForLoadState('networkidle');
	await page
		.getByLabel('Game', { exact: true })
		.selectOption('builtin-500-rum');
	await page.getByText('Customize house rules', { exact: true }).click();
	await page
		.getByLabel('Family game name', { exact: true })
		.fill('Family ten-card Rummy');
	await page.getByLabel('Cards per player', { exact: true }).fill('10');
	await page
		.getByLabel('Cards each with two players', { exact: true })
		.fill('10');
	await page.getByLabel('Maximum players', { exact: true }).fill('5');
	await page.getByLabel('Target score', { exact: true }).fill('250');
	await page
		.getByRole('button', { name: 'Save family rules', exact: true })
		.click();
	await expect(page.getByLabel('Game', { exact: true })).not.toHaveValue(
		'builtin-500-rum',
	);
	const rulesetId = await page.getByLabel('Game', { exact: true }).inputValue();
	const r = await (await request.get(`/api/rulesets/${rulesetId}`)).json();
	expect(r.bundle.runtimeRulePack.tableRules.deal.byPlayerCount['2']).toBe(10);
	await page.getByLabel('Your name', { exact: true }).fill('Family host');
	await page.getByRole('button', { name: 'Create room', exact: true }).click();
	await expect(page.getByTestId('room-code')).toBeVisible();
	const code = await page.getByTestId('room-code').innerText();
	const token = await page.evaluate(
		(c) => localStorage.getItem(`jc-seat-${c}`),
		code,
	);
	const second = crypto.randomUUID();
	await request.post(`/api/rooms/${code}`, {
		headers: { authorization: `Bearer ${second}` },
		data: { type: 'join', name: 'Family guest' },
	});
	const before = await (
		await request.get(`/api/rooms/${code}`, {
			headers: { authorization: `Bearer ${token}` },
		})
	).json();
	await request.post(`/api/rooms/${code}`, {
		headers: { authorization: `Bearer ${token}` },
		data: {
			type: 'start',
			revision: before.revision,
			requestId: crypto.randomUUID(),
		},
	});
	const after = await (
		await request.get(`/api/rooms/${code}`, {
			headers: { authorization: `Bearer ${token}` },
		})
	).json();
	expect(after.rules.deal.byPlayerCount['2']).toBe(10);
	expect(after.rules.scoring.target).toBe(250);
	expect(after.table.hands[after.selfId]).toHaveLength(10);
});

test('custom Golf values and disabled cancellation apply to guided score entry', async ({
	page,
}) => {
	await signInOwner(page.request);
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.locator('#guided-ruleset').click();
	await page
		.getByRole('option', { name: 'Six Card Golf', exact: true })
		.click();
	await page.getByText('Customize house rules', { exact: true }).click();
	await page
		.getByLabel('Family game name', { exact: true })
		.fill('Golf without cancellations');
	await page.getByLabel('Matching cards in a column cancel to zero').uncheck();
	await page.getByLabel('Points for K', { exact: true }).fill('-1');
	await page.getByLabel('Number of rounds', { exact: true }).fill('3');
	await page
		.getByRole('button', { name: 'Save family rules', exact: true })
		.click();
	await expect(page.locator('#guided-ruleset')).toContainText(
		'Golf without cancellations',
	);
	await page
		.getByRole('button', { name: 'Create session', exact: true })
		.click();
	await expect(
		page.getByRole('heading', { name: 'Add round', exact: true }),
	).toBeVisible();
	await expect(
		page.getByText('Matching cards in a column cancel.', { exact: false }),
	).toHaveCount(0);
	await page.getByRole('tab', { name: 'Guided cards', exact: true }).click();
	for (const player of ['Player 1', 'Player 2'])
		for (let n = 0; n < 6; n++)
			await page
				.getByRole('button', {
					name: `${player}-Your six cards: add K`,
					exact: true,
				})
				.click();
	await page.getByRole('button', { name: 'Add round', exact: true }).click();
	await expect(page.locator('.session-summary')).toContainText('Events: 1');
	const id = await page.evaluate(() =>
		localStorage.getItem('jc-score-session'),
	);
	const saved = await page.evaluate(
		(id) => JSON.parse(localStorage.getItem(`jc-offline-score-v1:${id}`)!),
		id,
	);
	expect(saved.base.state.totalsByPlayer).toEqual({
		'Player 1': -6,
		'Player 2': -6,
	});
});

test('an offline undo conflict preserves remote scores and saves a separate copy', async ({
	page,
	context,
	request,
}) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page
		.getByRole('button', { name: 'Create session', exact: true })
		.click();
	await expect(
		page.getByRole('heading', { name: 'Add round', exact: true }),
	).toBeVisible();
	await page.getByText('Manual points', { exact: true }).click();
	await page
		.getByRole('spinbutton', { name: 'Player 1', exact: true })
		.fill('10');
	await page
		.getByRole('spinbutton', { name: 'Player 2', exact: true })
		.fill('0');
	await page.getByRole('button', { name: 'Add round', exact: true }).click();
	await expect(page.locator('.session-summary')).toContainText('Events: 1');
	const originalId = await page.evaluate(() =>
		localStorage.getItem('jc-score-session'),
	);
	await context.setOffline(true);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.locator('.session-summary')).toContainText('Events: 2');
	await request.post(`/api/sessions/${originalId}`, {
		data: {
			scoreEvent: {
				type: 'add_delta',
				entries: [{ target: { kind: 'player', id: 'Player 1' }, delta: 20 }],
			},
		},
	});
	await context.setOffline(false);
	await expect(page.getByLabel('Score sync status')).toContainText(
		'Another device changed',
		{ timeout: 15000 },
	);
	await page
		.getByRole('button', {
			name: 'Save my scores as a separate session',
			exact: true,
		})
		.click();
	await expect(page.getByLabel('Score sync status')).toContainText(
		'Saved and synced',
	);
	const copyId = await page.evaluate(() =>
		localStorage.getItem('jc-score-session'),
	);
	expect(copyId).not.toBe(originalId);
	const remote = await (
		await request.get(`/api/sessions/${originalId}`)
	).json();
	const copy = await (await request.get(`/api/sessions/${copyId}`)).json();
	expect(remote.state.totalsByPlayer['Player 1']).toBe(30);
	expect(copy.state.totalsByPlayer['Player 1'] ?? 0).toBe(0);
});
