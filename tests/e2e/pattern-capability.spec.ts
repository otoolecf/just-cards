import { signInOwner } from './owner';
import { test, expect } from '@playwright/test';

for (const game of ['builtin-six-card-golf', 'builtin-500-rum']) {
	test(`${game} hides pattern entry in new and resumed score sessions`, async ({ page }) => {
		await page.goto(`/?ruleset=${game}`);
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Create session', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Add round', exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Pattern round (optional)', exact: true })).toHaveCount(0);
		const id = await page.evaluate(() => localStorage.getItem('jc-score-session'));
		const state = await (await page.request.get(`/api/sessions/${id}`)).json();
		expect(state.config.scoreGuidedProfile.patternRound).toBe(false);
		await page.goto('/');
		await expect(page.getByRole('button', { name: 'Add round', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Add pattern round', exact: true })).toHaveCount(0);
		// Older saved sessions do not have the new capability field.
		delete state.config.scoreGuidedProfile.patternRound;
		const legacy = await page.request.post('/api/sessions', { data: { config: state.config } });
		expect(legacy.ok()).toBe(true);
		const restored = await legacy.json();
		await page.evaluate(id => localStorage.setItem('jc-score-session', id), restored.sessionId);
		await page.reload();
		await expect(page.getByRole('button', { name: 'Add round', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Add pattern round', exact: true })).toHaveCount(0);
	});
}

test('custom ruleset explicitly enables pattern entry and preserves it on resume', async ({ page }) => {
	await signInOwner(page.request);
	const { rulesets } = await (await page.request.get('/api/rulesets')).json();
	const bundle = rulesets.find((r: { id: string }) => r.id === 'builtin-six-card-golf').bundle;
	bundle.uiProfile.scorekeeper = { patternRound: true };
	bundle.displayName = 'Custom pattern bonus';
	const response = await page.request.post('/api/rulesets', { data: { name: bundle.displayName, origin: 'manual', bundle } });
	expect(response.ok()).toBe(true);
	const ruleset = await response.json();
	await page.goto(`/?ruleset=${ruleset.id}`);
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Create session', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Add pattern round', exact: true })).toBeVisible();
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Add pattern round', exact: true })).toBeVisible();
});
