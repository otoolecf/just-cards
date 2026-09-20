import { test, expect } from '@playwright/test';

test('renames by stable ID, confirms archived deletion and preserves rooms and score sessions', async ({
	page,
	request,
}) => {
	const name = `Delete QA ${crypto.randomUUID().slice(0, 8)}`;
	const created = await (
		await request.post('/api/rulesets/builtin-six-card-golf', {
			data: { name },
		})
	).json();
	const token = crypto.randomUUID();
	const room = await (
		await request.post('/api/rooms', {
			headers: { authorization: `Bearer ${token}` },
			data: { rulesetId: created.id, name: 'Host' },
		})
	).json();
	await page.goto(`/?ruleset=${created.id}`);
	await page.waitForLoadState('networkidle');
	await page
		.getByRole('button', { name: 'Create session', exact: true })
		.click();
	await expect.poll(() => page.evaluate(() => localStorage.getItem('jc-score-session'))).not.toBeNull();
	const sessionId = await page.evaluate(() =>
		localStorage.getItem('jc-score-session'),
	);
	const snapshot = await (
		await request.get(`/api/sessions/${sessionId}`)
	).json();
	expect(snapshot.config.scoreRulesetId).toBe(created.id);
	await page.goto('/play');
	await page.waitForLoadState('networkidle');
	await page
		.getByRole('button', { name: 'Rename or remove games', exact: true })
		.click();
	const game = page.getByRole('region', { name, exact: true });
	await expect(
		game.getByRole('button', { name: 'Delete permanently', exact: true }),
	).toHaveCount(0);
	await game.getByRole('button', { name: 'Rename', exact: true }).click();
	await game.getByLabel('Game name').fill(name + ' renamed');
	await game.getByRole('button', { name: 'Save name' }).click();
	const renamed = page.getByRole('region', {
		name: name + ' renamed',
		exact: true,
	});
	expect(
		(await (await request.get(`/api/rulesets/${created.id}`)).json()).name,
	).toBe(name + ' renamed');
	await renamed
		.getByRole('button', { name: 'Remove from list', exact: true })
		.click();
	await page.getByLabel('Show archived games').check();
	await renamed
		.getByRole('button', { name: 'Delete permanently', exact: true })
		.click();
	await expect(
		renamed.getByRole('region', {
			name: `Confirm deletion of ${name} renamed`,
		}),
	).toBeVisible();
	await renamed
		.getByRole('button', { name: 'Cancel deletion', exact: true })
		.click();
	expect((await request.get(`/api/rulesets/${created.id}`)).ok()).toBe(true);
	await renamed
		.getByRole('button', { name: 'Delete permanently', exact: true })
		.click();
	await renamed
		.getByRole('button', { name: 'Confirm permanent deletion', exact: true })
		.click();
	await expect(renamed).toHaveCount(0);
	expect((await request.get(`/api/rulesets/${created.id}`)).status()).toBe(404);
	const retained = await (
		await request.get(`/api/rooms/${room.code}`, {
			headers: { authorization: `Bearer ${token}` },
		})
	).json();
	expect(retained.name).toBe(name);
	expect(retained.rules).toEqual(room.rules);
	expect(
		(await (await request.get(`/api/sessions/${sessionId}`)).json()).config,
	).toEqual(snapshot.config);
	// Simulate another browser's old downloaded catalog. Online load must not resurrect it.
	await page.evaluate(
		(record) =>
			localStorage.setItem('jc-score-rulesets-v1', JSON.stringify([record])),
		created,
	);
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	expect(
		await page.evaluate(
			(id) =>
				JSON.parse(localStorage.getItem('jc-score-rulesets-v1') ?? '[]').some(
					(r: { id: string }) => r.id === id,
				),
			created.id,
		),
	).toBe(false);
	await page.goto('/play');
	await page.waitForLoadState('networkidle');
	await page
		.getByRole('button', { name: 'Rename or remove games', exact: true })
		.click();
	await page.getByLabel('Show archived games').check();
	await expect(
		page.getByRole('region', { name: name + ' renamed', exact: true }),
	).toHaveCount(0);
});
