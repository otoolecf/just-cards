import { test, expect } from '@playwright/test';

test('selected-game help explains button actions and follows the room into play', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/play');
	await page.waitForLoadState('networkidle');
	await page
		.getByLabel('Game', { exact: true })
		.selectOption('builtin-palace-family');
	const help = page
		.locator('details')
		.filter({
			has: page.locator('summary', { hasText: 'Rules and scoring defaults' }),
		});
	await help.locator('summary').click();
	await expect(
		help.getByRole('heading', { name: 'Your goal', exact: true }),
	).toBeVisible();
	await expect(help).toContainText('3: The next player takes the whole pile');
	await expect(help).toContainText('7: The next play must be 7 or lower');
	await page.getByLabel('Game', { exact: true }).selectOption('builtin-palace');
	await expect(help).not.toContainText('3: The next player');
	await expect(help).not.toContainText('7: The next play');
	await page
		.getByLabel('Game', { exact: true })
		.selectOption('builtin-solitaire');
	await expect(help).toContainText('To 3');
	await expect(help).toContainText('Recycle waste');
	await expect(help).not.toContainText('500 Rum');
	await page.getByLabel('Your name').fill('Guide reader');
	await page.getByRole('button', { name: 'Create room', exact: true }).click();
	await page.getByText('How to play', { exact: true }).click();
	const roomHelp = page
		.locator('details')
		.filter({ has: page.locator('summary', { hasText: 'How to play' }) });
	await expect(
		roomHelp.getByRole('heading', { name: 'Moving cards', exact: true }),
	).toBeVisible();
	await expect(roomHelp).toContainText('a red 6 goes on a black 7');
	await expect(roomHelp).not.toContainText('explicit Klondike defaults');
	await page.reload();
	await page.getByText('How to play', { exact: true }).click();
	await expect(roomHelp).toContainText('Recycle waste');
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
});
