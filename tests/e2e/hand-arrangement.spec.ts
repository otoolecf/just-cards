import { test, expect, type Page } from '@playwright/test';

test('rearranges a waiting Rummy hand with taps, keyboard and drag, preserving it on reload and draw', async ({
	browser
}) => {
	const first = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const second = await browser.newContext();
	const host = await first.newPage(),
		guest = await second.newPage();
	await host.goto('/play');
	await host.waitForLoadState('networkidle');
	await host.getByLabel('Game', { exact: true }).selectOption('builtin-500-rum');
	await host.getByLabel('Your name', { exact: true }).fill('Host');
	await host.getByRole('button', { name: 'Create room', exact: true }).click();
	await expect(host.getByTestId('room-code')).toBeVisible();
	const code = await host.getByTestId('room-code').innerText();
	await guest.goto(host.url());
	await guest.getByLabel('Your name', { exact: true }).fill('Guest');
	await guest.getByRole('button', { name: 'Join room', exact: true }).click();
	await expect(host.getByText('Guest', { exact: true })).toBeVisible();
	await host.getByRole('button', { name: 'Deal cards', exact: true }).click();
	const cards = host.getByTestId('my-hand').locator('button');
	await expect(cards).toHaveCount(13);
	const ids = () =>
		cards.evaluateAll((elements) => elements.map((el) => el.getAttribute('data-card-id')));
	async function view(page: Page) {
		const token = await page.evaluate((code) => localStorage.getItem(`jc-seat-${code}`), code);
		return await (
			await page.request.get(`/api/rooms/${code}`, {
				headers: { authorization: `Bearer ${token}` }
			})
		).json();
	}
	const before = await view(host);
	const original = await ids();
	await expect(host.getByRole('button', { name: /Draw from stock/ })).toBeDisabled();
	await host.getByRole('button', { name: 'Arrange hand', exact: true }).click();
	await expect(host.getByText('Arrange your hand, then tap Done arranging to play.', { exact: true })).toBeVisible();
	await cards.nth(0).click();
	await cards.nth(2).click();
	let expected = [original[1], original[2], original[0], ...original.slice(3)];
	expect(await ids()).toEqual(expected);
	await cards.nth(2).press('Enter');
	await host.getByRole('button', { name: 'Move left', exact: true }).press('Enter');
	expected = [original[1], original[0], original[2], ...original.slice(3)];
	expect(await ids()).toEqual(expected);
	await cards.last().dragTo(cards.first());
	expected = [expected[12], ...expected.slice(0, 12)];
	expect(await ids()).toEqual(expected);
	await host.getByRole('button', { name: 'Done arranging', exact: true }).click();
	await host.reload();
	await expect(cards).toHaveCount(13);
	expect(await ids()).toEqual(expected);
	expect(await view(host)).toEqual(before);
	await guest.getByRole('button', { name: /Draw from stock/ }).click();
	await guest.getByTestId('my-hand').locator('button').first().click();
	await guest.getByRole('button', { name: 'Discard selected', exact: true }).click();
	await expect(host.getByRole('button', { name: /Draw from stock/ })).toBeEnabled();
	expect(await ids()).toEqual(expected);
	await host.getByRole('button', { name: /Draw from stock/ }).click();
	await expect(cards).toHaveCount(14);
	expect((await ids()).slice(0, 13)).toEqual(expected);
	expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await first.close();
	await second.close();
});
