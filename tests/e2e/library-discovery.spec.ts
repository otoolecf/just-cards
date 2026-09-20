import { test, expect } from '@playwright/test';
for (const route of ['/play', '/']) {
 test(`game management is discoverable from the ${route} picker`, async ({ page }) => {
  await page.goto(route);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.library')).not.toHaveAttribute('open', '');
  await expect(page.getByRole('button', { name: 'Rename or remove games', exact: true })).toBeVisible({ timeout: 1500 });
  await page.getByRole('button', { name: 'Rename or remove games', exact: true }).click();
  await expect(page.locator('.library')).toHaveAttribute('open', '');
  await expect(page.locator('.library summary')).toBeFocused();
  await expect(page.getByLabel('Show archived games')).toBeVisible();
  await expect(page.locator('.library')).toContainText('Remove from list');
 });
}
