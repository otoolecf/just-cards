import { expect, test } from '@playwright/test';

for (const route of ['/', '/play']) {
	test(`source footer is accessible on mobile ${route}`, async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 740 });
		await page.goto(route);
		const link = page.getByRole('contentinfo').getByRole('link', { name: 'Source on GitHub', exact: true });
		await expect(link).toHaveAttribute('href', 'https://github.com/otoolecf/just-cards');
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
		await link.scrollIntoViewIfNeeded();
		await expect(link).toBeVisible();
		await link.focus();
		await expect(link).toBeFocused();
		expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	});
}

for (const route of ['/', '/play']) {
	test(`project about disclosure works on mobile ${route}`, async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 740 });
		await page.goto(route);
		const footer = page.getByRole('contentinfo');
		const summary = footer.locator('summary', { hasText: 'About this project' });
		const description = footer.getByText('Just Cards is a personal side project', { exact: false });
		await expect(summary).toBeVisible();
		await expect(description).not.toBeVisible();
		await summary.focus();
		await page.keyboard.press('Enter');
		await expect(description).toBeVisible();
		await expect(description).toContainText('spend more time playing while learning unfamiliar games more easily.');
		await expect(description).toContainText('Substantial portions of the code and documentation were developed with AI assistance.');
		await expect(description).toContainText('Expect rough edges; bug reports and contributions are welcome.');
		expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		await page.keyboard.press('Enter');
		await expect(description).not.toBeVisible();
		await expect(footer.getByRole('link', { name: 'Source on GitHub', exact: true })).toBeVisible();
	});
}
