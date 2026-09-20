import { test, expect } from '@playwright/test';

test('two phones join, choose hidden positions, draw, swap and resume', async ({ browser }) => {
	const first = await browser.newContext({
		viewport: { width: 390, height: 844 }
	});
	const second = await browser.newContext({
		viewport: { width: 390, height: 844 }
	});
	const a = await first.newPage(),
		b = await second.newPage();
	await a.goto('/play');
	await a.waitForLoadState('networkidle');
	await a.getByLabel('Your name').fill('Parent');
	await a.getByRole('button', { name: 'Create room' }).click();
	await expect(a.getByTestId('room-code')).toBeVisible();
	const url = a.url();
	await b.goto(url);
	await b.getByLabel('Your name').fill('Child');
	await b.getByRole('button', { name: 'Join room' }).click();
	await expect(a.getByText('Child', { exact: true })).toBeVisible();
	await a.getByRole('button', { name: 'Deal cards' }).click();
	for (const page of [a, b]) {
		await expect(page.getByRole('button', { name: 'Your card 1: Hidden' })).toBeVisible();
		await page.getByRole('button', { name: 'Your card 1: Hidden' }).click();
		await page.getByRole('button', { name: 'Your card 2: Hidden' }).click();
	}
	await expect(b.getByRole('button', { name: /Draw from stock/ })).toBeEnabled();
	await expect(a.getByRole('button', { name: /Draw from stock/ })).toBeDisabled();
	await b.getByRole('button', { name: /Draw from stock/ }).click();
	await expect(b.getByTestId('drawn-card')).toBeVisible();
	await b.getByRole('button', { name: 'Your card 3: Hidden' }).click();
	await expect(a.getByRole('button', { name: /Draw from stock/ })).toBeEnabled();
	await b.reload();
	await expect(b.getByTestId('my-hand').getByRole('button')).toHaveCount(6);
	await expect(b.getByRole('button', { name: /Your card 3:/ })).not.toHaveText('?');
	expect(await b.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	for (let slot = 4; slot <= 6; slot++) {
		await a.getByRole('button', { name: /Draw from stock/ }).click();
		await a.getByRole('button', { name: 'Discard drawn card', exact: true }).click();
		await b.getByRole('button', { name: /Draw from stock/ }).click();
		await b.getByRole('button', { name: `Your card ${slot}: Hidden`, exact: true }).click();
	}
	await expect(a.getByRole('heading', { name: 'Round scores', exact: true })).toBeVisible();
	await expect(b.getByRole('heading', { name: 'Round scores', exact: true })).toBeVisible();
	await a.getByRole('button', { name: 'Deal next round', exact: true }).click();
	await expect(a.getByRole('button', { name: 'Your card 1: Hidden', exact: true })).toBeVisible();
	await first.close();
	await second.close();
});

test('guided physical-card input accepts ranks and preserves editable grid positions', async ({
	page
}) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.getByPlaceholder('Player 1', { exact: true }).fill('Parent');
	await page.getByPlaceholder('Player 2', { exact: true }).fill('Child');
	await page.getByRole('button', { name: 'Create session', exact: true }).click();
	for (const [player, ranks] of [
		['Parent', ['2', 'K', 'Q', '2', 'A', 'Q']],
		['Child', ['A', '3', '4', '5', '6', '7']]
	] as const) {
		for (const rank of ranks)
			await page
				.getByRole('button', {
					name: `${player}-Your six cards: add ${rank}`,
					exact: true
				})
				.click();
	}
	// Correcting a position must not shift the remaining columns.
	await page
		.getByRole('button', {
			name: 'Parent-Your six cards: row 1 column 2',
			exact: true
		})
		.click();
	await page.getByRole('button', { name: 'Parent-Your six cards: add K', exact: true }).click();
	await page.getByRole('button', { name: 'Add round', exact: true }).click();
	await expect(page.locator('.status-success')).toHaveText('Guided round added.');
	const score = page
		.locator('section')
		.filter({
			has: page.getByRole('heading', { name: 'Current score', exact: true })
		})
		.first();
	await expect(score).toContainText('Parent');
	await expect(score).toContainText('26');
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.locator('.status-success')).toHaveText('Undo applied.');
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect(page.locator('.status-success')).toHaveText('Redo applied.');
	await page.reload();
	await expect(
		page.getByRole('button', {
			name: 'Parent-Your six cards: add 2',
			exact: true
		})
	).toBeVisible();
	await expect(score).toContainText('26');
});

test('500 Rum deals thirteen private cards and completes a stock-draw turn', async ({
	browser
}) => {
	const first = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const second = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const host = await first.newPage(),
		guest = await second.newPage();
	await host.goto('/play');
	await host.waitForLoadState('networkidle');
	await host.getByLabel('Game', { exact: true }).selectOption('builtin-500-rum');
	await host.getByLabel('Your name').fill('Parent');
	await host.getByRole('button', { name: 'Create room' }).click();
	await expect(host.getByTestId('room-code')).toBeVisible();
	await guest.goto(host.url());
	await guest.getByLabel('Your name').fill('Child');
	await guest.getByRole('button', { name: 'Join room' }).click();
	await expect(host.getByText('Child', { exact: true })).toBeVisible();
	await host.getByRole('button', { name: 'Deal cards' }).click();
	await expect(guest.getByTestId('my-hand').getByRole('button')).toHaveCount(13);
	await expect(
		guest.getByText('Starting hand: 13 cards each for 2 players.', { exact: true })
	).toBeVisible();
	await expect(guest.getByRole('button', { name: 'Play new meld', exact: true })).toBeVisible();
	await expect(guest.getByRole('button', { name: /Your card.*Hidden/ })).toHaveCount(0);
	await guest.getByRole('button', { name: /Draw from stock/ }).click();
	await expect(guest.getByTestId('my-hand').getByRole('button')).toHaveCount(14);
	await guest.getByTestId('my-hand').getByRole('button').first().click();
	await guest.getByRole('button', { name: 'Discard selected', exact: true }).click();
	await expect(guest.getByTestId('my-hand').getByRole('button')).toHaveCount(13);
	await expect(host.getByRole('button', { name: /Draw from stock/ })).toBeEnabled();
	await expect(host.getByRole('heading', { name: 'Table melds', exact: true })).toBeVisible();
	expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await first.close();
	await second.close();
});
