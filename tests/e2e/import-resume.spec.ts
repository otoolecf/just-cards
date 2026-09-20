import { test, expect } from '@playwright/test';
const golf = `Six Card Golf. 2 to 4 players. Each player is dealt 6 cards face down. Arrange cards in 2 rows of 3 in front of them and turn 2 cards face up.
Draw from stock or discard then swap a layout card or discard. The round ends when one layout is entirely face up. Play nine deals; lowest total wins.
Each ace counts 1 point. Each 2 counts minus 2 points. Each jack or queen scores 10 points. Each king scores zero points. Equal cards in the same column score zero points.`;
test('imports rules, creates a shared table, and resumes it from the lobby', async ({ page }) => {
	test.setTimeout(240_000);
	await page.goto('/play');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Rules source', { exact: true }).selectOption('text');
	await page.getByLabel('Game rules text', { exact: true }).fill(golf);
	const name = `Family Golf ${Date.now()}`;
	await page.getByLabel('Game name (optional)', { exact: true }).fill(name);
	await page.getByRole('button', { name: 'Import rules', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Check these rules before playing' })).toBeVisible(
		{ timeout: 200_000 }
	);
	await expect(page.getByRole('button', { name: 'Accept rules & enable play' })).toBeDisabled();
	await page.getByLabel('I’ve checked these rules and accept the listed assumptions.').check();
	await page.getByRole('button', { name: 'Accept rules & enable play' }).click();
	await expect(page.getByText('Ready for shared play.', { exact: true })).toBeVisible();
	const selected = await page.getByLabel('Game', { exact: true }).inputValue();
	expect(selected).toMatch(/^ruleset-/);
	await page.getByLabel('Your name', { exact: true }).fill('Importer');
	await page.getByRole('button', { name: 'Create room', exact: true }).click();
	await expect(page.getByTestId('room-code')).toBeVisible();
	const roomUrl = page.url();
	await page.getByRole('link', { name: 'Just Cards', exact: true }).click();
	await page.getByRole('link', { name: /Resume .*Importer/ }).click();
	await expect(page).toHaveURL(roomUrl);
	await expect(page.getByText('You', { exact: true })).toBeVisible();
	await page.goto('/play');
	await expect(
		page.getByLabel('Game', { exact: true }).getByRole('option', { name, exact: true })
	).toHaveCount(1);
});
test('explains why a rules directory is not a playable game source', async ({ page }) => {
	await page.goto('/play');
	await page.waitForLoadState('networkidle');
	await page
		.getByLabel('Game rules URL', { exact: true })
		.fill('https://bicyclecards.com/how-to-play');
	await page.getByRole('button', { name: 'Import rules', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('specific game');
});
