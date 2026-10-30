import { expect, test } from '@playwright/test';

for (const route of ['/', '/play']) {
	test(`Just Cards branding on mobile ${route}`, async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 740 });
		await page.goto(route);
		await expect(page.getByRole('heading', { name: 'Just Cards', exact: true, level: 1 })).toBeVisible();
		await expect(page).toHaveTitle(/^Just Cards/);
		const decoration = page.locator('.jc-wordmark-cards');
		await expect(decoration).toHaveAttribute('aria-hidden', 'true');
		await expect(page.getByRole('navigation', { name: 'Mode links' })).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	});
}
