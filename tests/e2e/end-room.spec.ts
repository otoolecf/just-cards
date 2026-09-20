import { test, expect } from '@playwright/test';

test('host ends a game for everyone and players leave to create another room', async ({
	browser
}) => {
	const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const guestContext = await browser.newContext();
	const host = await hostContext.newPage(),
		guest = await guestContext.newPage();
	await host.goto('/play');
	await host.waitForLoadState('networkidle');
	await host.getByLabel('Your name', { exact: true }).fill('Host');
	await host.getByRole('button', { name: 'Create room', exact: true }).click();
	await expect(host.getByTestId('room-code')).toBeVisible();
	const oldUrl = host.url();
	await guest.goto(oldUrl);
	await guest.getByLabel('Your name', { exact: true }).fill('Guest');
	await guest.getByRole('button', { name: 'Join room', exact: true }).click();
	await expect(host.getByText('Guest', { exact: true })).toBeVisible();
	await host.getByRole('button', { name: 'Deal cards', exact: true }).click();
	await expect(host.getByTestId('my-hand')).toBeVisible();
	await expect(guest.getByRole('button', { name: 'End game', exact: true })).toHaveCount(0);
	await host.getByRole('button', { name: 'End game', exact: true }).click();
	await host.getByRole('button', { name: 'Keep playing', exact: true }).click();
	await expect(host.getByTestId('my-hand')).toBeVisible();
	await host.getByRole('button', { name: 'End game', exact: true }).click();
	await host.getByRole('button', { name: 'End game for everyone', exact: true }).click();
	for (const page of [host, guest]) {
		await expect(page.getByRole('heading', { name: 'Game ended', exact: true })).toBeVisible();
		await expect(page.getByTestId('my-hand')).toHaveCount(0);
		await expect(page.getByRole('button', { name: /Draw from stock/ })).toHaveCount(0);
	}
	await host.reload();
	await expect(host.getByRole('heading', { name: 'Game ended', exact: true })).toBeVisible();
	await guest.getByRole('button', { name: 'Leave room', exact: true }).click();
	await expect(guest).toHaveURL(/\/play$/);
	await expect(guest.getByRole('link', { name: /Resume/ })).toHaveCount(0);
	await host.getByRole('button', { name: 'Create new room', exact: true }).click();
	await host.getByLabel('Your name', { exact: true }).fill('Host');
	await host.getByRole('button', { name: 'Create room', exact: true }).click();
	await expect(host.getByTestId('room-code')).toBeVisible();
	expect(host.url()).not.toBe(oldUrl);
	await hostContext.close();
	await guestContext.close();
});
