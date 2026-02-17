import { expect, test, type Page } from '@playwright/test';

const BASE_RULEPACK_V0 = {
	schemaVersion: 'rulepack/v0',
	capabilities: [
		'value:base-ranks',
		'value:modifier-set',
		'value:op-algebra',
		'routing:target-kinds',
		'settlement:pool-transfer',
		'trace:explain'
	],
	baseAceValue: 1,
	rankValues: { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13 },
	modifiers: [],
	modifierResolution: 'last_match_wins'
};

async function createSessionViaApi(page: Page, config: Record<string, unknown>): Promise<string> {
	const response = await page.evaluate(async (payload) => {
		const result = await fetch('/api/sessions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ config: payload })
		});
		const body = (await result.json()) as { sessionId?: string; error?: string };
		return { ok: result.ok, sessionId: body.sessionId ?? '', error: body.error ?? '' };
	}, config);

	expect(response.ok, response.error || 'create session request failed').toBe(true);
	expect(response.sessionId.startsWith('sess-')).toBe(true);
	return response.sessionId;
}

async function getSessionStateViaApi(page: Page, sessionId: string): Promise<{
	config?: { scoreModeId?: string };
	eventCount: number;
}> {
	return page.evaluate(async (id) => {
		const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
		const body = (await response.json()) as {
			config?: { scoreModeId?: string };
			eventCount?: number;
			error?: string;
		};
		if (!response.ok) {
			throw new Error(body.error ?? 'failed to read session state');
		}
		return {
			config: body.config,
			eventCount: body.eventCount ?? 0
		};
	}, sessionId);
}

async function postScoreEventViaApi(page: Page, sessionId: string, scoreEvent: Record<string, unknown>): Promise<void> {
	const response = await page.evaluate(
		async ({ id, eventPayload }) => {
			const result = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ scoreEvent: eventPayload })
			});
			const body = (await result.json()) as { error?: string };
			return { ok: result.ok, error: body.error ?? '' };
		},
		{ id: sessionId, eventPayload: scoreEvent }
	);

	expect(response.ok, response.error || 'post score event failed').toBe(true);
}

test('scorekeeper session flow', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('spinbutton', { name: 'Players' }).fill('2');
	await page.getByPlaceholder('Player 1').fill('Alice');
	await page.getByPlaceholder('Player 2').fill('Bob');
	await page.getByRole('button', { name: 'Create session' }).click();
	try {
		await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible({ timeout: 5000 });
	} catch {
		await page.getByRole('button', { name: 'Create session' }).click();
		await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible({ timeout: 5000 });
	}

	await page.getByText('Quick text').click();
	await page.getByLabel('Quick round text').fill('Alice: A H\nBob: 2D');
	await page.getByRole('button', { name: 'Add round' }).click();
	await expect(page.locator('.status-success')).toHaveText('Round added.');
	await expect(page.locator('p:has-text("Events:")')).toContainText('1');
	await expect(page.locator('section:has(h2:has-text("Recent events")) li')).toHaveCount(1);

	await page.getByRole('button', { name: 'pattern: suit hearts' }).click();
	await page.getByRole('button', { name: 'pattern: add AH' }).click();
	await page.getByRole('button', { name: 'pattern: add AH' }).click();
	await page.getByRole('button', { name: 'Add pattern round' }).click();
	await expect(page.locator('.status-success')).toHaveText('Pattern round submitted.');
	await expect(page.locator('p:has-text("Events:")')).toContainText('2');

	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.locator('.status-success')).toHaveText('Undo applied.');
	await page.getByRole('button', { name: 'Redo' }).click();
	await expect(page.locator('.status-success')).toHaveText('Redo applied.');
});

test('scorekeeper row entry flow', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('spinbutton', { name: 'Players' }).fill('2');
	await page.getByPlaceholder('Player 1').fill('Alice');
	await page.getByPlaceholder('Player 2').fill('Bob');
	await page.getByRole('button', { name: 'Create session' }).click();
	try {
		await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible({ timeout: 5000 });
	} catch {
		await page.getByRole('button', { name: 'Create session' }).click();
		await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible({ timeout: 5000 });
	}
	await expect(page.locator('section:has(h2:has-text("Current score"))').first()).toBeVisible();

	await page.getByRole('button', { name: 'Player 1: suit clubs' }).click();
	await page.getByRole('button', { name: 'Player 1: add AC' }).click();
	await page.getByRole('button', { name: 'Player 1: add 10C' }).click();
	await page.getByRole('button', { name: 'Player 2: suit diamonds' }).click();
	await page.getByRole('button', { name: 'Player 2: add 2D' }).click();
	await page.getByRole('button', { name: 'Player 2: add 3D' }).click();
	await page.getByRole('button', { name: 'Add round' }).click();

	await expect(page.locator('.status-success')).toHaveText('Round added.');
	await expect(page.locator('p:has-text("Events:")')).toHaveText(/Events:\s*1/);
	await expect(page.locator('section:has(h2:has-text("Recent events")) li')).toHaveCount(1);
});

test('mode persistence syncs across browser contexts', async ({ browser }) => {
	const contextA = await browser.newContext();
	const contextB = await browser.newContext();
	const pageA = await contextA.newPage();
	const pageB = await contextB.newPage();

	await pageA.goto('/');
	const sessionId = await createSessionViaApi(pageA, {
		scoreModeId: 'rummy',
		scoreRulePack: BASE_RULEPACK_V0
	});

	const initialStateA = await getSessionStateViaApi(pageA, sessionId);
	expect(initialStateA.config?.scoreModeId).toBe('rummy');
	expect(initialStateA.eventCount).toBe(0);

	await pageB.goto('/');
	const initialStateB = await getSessionStateViaApi(pageB, sessionId);
	expect(initialStateB.config?.scoreModeId).toBe('rummy');
	expect(initialStateB.eventCount).toBe(0);

	await postScoreEventViaApi(pageA, sessionId, {
		type: 'add_round',
		playerCards: {
			Alice: [{ rank: '2', suit: 'hearts' }],
			Bob: [{ rank: '3', suit: 'hearts' }]
		}
	});

	const syncedStateB = await getSessionStateViaApi(pageB, sessionId);
	expect(syncedStateB.config?.scoreModeId).toBe('rummy');
	expect(syncedStateB.eventCount).toBe(1);

	await contextA.close();
	await contextB.close();
});

test('active session prioritizes current score panel', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('spinbutton', { name: 'Players' }).fill('2');
	await page.getByPlaceholder('Player 1').fill('Alice');
	await page.getByPlaceholder('Player 2').fill('Bob');
	await page.getByRole('button', { name: 'Create session' }).click();
	try {
		await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible({ timeout: 5000 });
	} catch {
		await page.getByRole('button', { name: 'Create session' }).click();
		await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible({ timeout: 5000 });
	}

	await expect(page.getByRole('heading', { name: 'Current score' })).toBeVisible();
	const sessionSummary = await page.locator('.session-summary p').first().innerText();
	const sessionId = sessionSummary.replace('Session:', '').trim();
	await postScoreEventViaApi(page, sessionId, {
		type: 'add_round',
		playerCards: {
			Alice: [{ rank: '5', suit: 'hearts' }],
			Bob: [{ rank: '2', suit: 'hearts' }]
		}
	});
	await page.getByRole('button', { name: 'Refresh' }).click();
	await expect(page.locator('p:has-text("Events:")')).toContainText('1');
	await expect(page.getByRole('heading', { name: 'Current score' })).toBeVisible();
});
