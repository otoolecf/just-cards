import {
	test,
	expect,
	type APIRequestContext,
	type Browser,
	type Page,
} from '@playwright/test';
async function openRoom(
	browser: Browser,
	request: APIRequestContext,
	id: string,
	n: number,
) {
	const tokens = Array.from({ length: n }, () => crypto.randomUUID());
	const created = await request.post('/api/rooms', {
		headers: { authorization: `Bearer ${tokens[0]}` },
		data: { rulesetId: id, name: 'Player 1' },
	});
	expect(created.ok()).toBe(true);
	const room = await created.json();
	for (let i = 1; i < n; i++)
		expect(
			(
				await request.post(`/api/rooms/${room.code}`, {
					headers: { authorization: `Bearer ${tokens[i]}` },
					data: { type: 'join', name: `Player ${i + 1}` },
				})
			).ok(),
		).toBe(true);
	const contexts = await Promise.all(
		tokens.map(() =>
			browser.newContext({ viewport: { width: 390, height: 844 } }),
		),
	);
	const pages = await Promise.all(contexts.map((c) => c.newPage()));
	for (let i = 0; i < n; i++) {
		await pages[i].goto('/play');
		await pages[i].evaluate(
			({ code, token }) => localStorage.setItem(`jc-seat-${code}`, token),
			{ code: room.code, token: tokens[i] },
		);
		await pages[i].goto(`/play/room/${room.code}`);
	}
	await pages[0]
		.getByRole('button', { name: 'Deal cards', exact: true })
		.click();
	return { pages, contexts, code: room.code, tokens };
}
test('Solitaire starts alone, draws, undoes, moves to a foundation and concedes', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/play');
	await page.waitForLoadState('networkidle');
	await page
		.getByLabel('Game', { exact: true })
		.selectOption('builtin-solitaire');
	await page.getByLabel('Your name').fill('Solo');
	await page.getByRole('button', { name: 'Create room', exact: true }).click();
	await page.getByRole('button', { name: 'Deal cards', exact: true }).click();
	const board = page.getByRole('region', { name: 'Solitaire table' });
	await expect(
		board.getByRole('button', { name: 'Draw one (24)' }),
	).toBeVisible();
	await board.getByRole('button', { name: 'Draw one (24)' }).click();
	await expect(
		board.getByRole('button', { name: 'Draw one (23)' }),
	).toBeVisible();
	await page.getByText('Table controls', { exact: true }).click();
	await page
		.getByRole('button', { name: 'Undo last play', exact: true })
		.click();
	await page.getByRole('button', { name: 'Confirm undo', exact: true }).click();
	await expect(
		board.getByRole('button', { name: 'Draw one (24)' }),
	).toBeVisible();
	// Draw until an Ace reaches waste; hidden stock stays private.
	for (let i = 0; i < 24; i++) {
		await board.getByRole('button', { name: /Draw one/ }).click();
 await expect(board.getByRole('heading',{name:`Waste (${i+1})`,exact:true})).toBeVisible();
		const ace = board
			.locator('.cap-row')
			.first()
			.getByRole('button', { name: /^A[♣♦♥♠]$/ });
		if (await ace.count()) {
			await ace.click();
			await board
				.getByRole('button', { name: 'Foundation 1 · Ace', exact: true })
				.click();
			await expect(
				board.getByRole('heading', { name: 'Foundations · 1 / 52' }),
			).toBeVisible();
			break;
		}
	}
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	await board.getByText('Stuck?', { exact: true }).click();
	await board
		.getByRole('button', { name: 'Concede deal', exact: true })
		.click();
	await expect(
		page.getByRole('button', { name: 'Play again', exact: true }),
	).toBeVisible();
	await page.getByRole('button', { name: 'Play again', exact: true }).click();
	await expect(
		board.getByRole('button', { name: 'Draw one (24)' }),
	).toBeVisible();
});
test('Palace chooses face-up cards and plays through its active zone on two phones', async ({
	browser,
	request,
}) => {
	const f = await openRoom(browser, request, 'builtin-palace-family', 2);
	for (const page of f.pages) {
		const board = page.getByRole('region', { name: 'Palace table' });
		await expect(
			board.getByRole('heading', {
				name: 'Your hand — select three face-up cards',
			}),
		).toBeVisible();
		const cards = board.locator('.cap-row').nth(1).locator('button');
		for (let i = 0; i < 3; i++) await cards.nth(i).click();
		await board.getByRole('button', { name: 'Place three face up' }).click();
	}
	const guest = f.pages[1],
		board = guest.getByRole('region', { name: 'Palace table' });
	await expect(
		board.getByRole('button', { name: 'Play selected (0)' }),
	).toBeVisible();
	const view = await (
		await request.get(`/api/rooms/${f.code}`, {
			headers: { authorization: `Bearer ${f.tokens[1]}` },
		})
	).json();
	const hand = view.table.hands[view.selfId];
	// Each selection is retained through polling, until a room revision changes.
	await board.locator(`[data-card-id="${hand[0].id}"]`).first().click();
	await expect(
		board.getByRole('button', { name: 'Play selected (1)' }),
	).toBeVisible();
	expect(
		await guest.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	await guest.reload();
	await expect(
		guest.getByRole('region', { name: 'Palace table' }),
	).toBeVisible();
	for (const c of f.contexts) await c.close();
});
test('Bridge auctions on four phones and declarer plays the exposed dummy', async ({
	browser,
	request,
}) => {
	const f = await openRoom(browser, request, 'builtin-bridge', 4),
		[north, east, south, west] = f.pages;
	await north
		.getByRole('combobox', { name: 'Strain', exact: true })
		.selectOption('notrump');
	await north.getByRole('button', { name: 'Bid 1NT', exact: true }).click();
	for (const p of [east, south, west])
		await p.getByRole('button', { name: 'Pass', exact: true }).click();
	const v = await (
		await request.get(`/api/rooms/${f.code}`, {
			headers: { authorization: `Bearer ${f.tokens[1]}` },
		})
	).json();
	await east
		.locator(`[data-card-id="${v.table.hands[v.selfId][0].id}"]`)
		.click();
	const nboard = north.getByRole('region', { name: 'Bridge table' });
	const dummy = nboard
		.locator('.cap-seat')
		.filter({ has: north.getByRole('heading', { name: /Player 3.*dummy/ }) });
	await expect(dummy.locator('button')).toHaveCount(13);
	await dummy.locator('button:enabled').first().click();
	await expect(dummy.locator('button')).toHaveCount(12);
	const sboard = south.getByRole('region', { name: 'Bridge table' });
	await expect(
		sboard
			.locator('.cap-seat')
			.filter({ has: south.getByRole('heading', { name: /Player 3.*dummy/ }) })
			.locator('button:enabled'),
	).toHaveCount(0);
	expect(
		await north.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true);
	for (const c of f.contexts) await c.close();
});
test('physical Bridge calculates a contract offline, persists it and undoes it', async ({
	page,
	context,
}) => {
	await page.goto('/?ruleset=builtin-bridge');
	await page.waitForLoadState('networkidle');
	await expect(
		page.getByPlaceholder('Player 4', { exact: true }),
	).toBeVisible();
	await page
		.getByRole('button', { name: 'Create session', exact: true })
		.click();
	await expect(
		page.getByRole('heading', { name: 'Enter the contract result' }),
	).toBeVisible();
	await page
		.getByRole('combobox', { name: 'Contract level', exact: true })
		.selectOption('3');
	await page
		.getByRole('combobox', { name: 'Contract strain', exact: true })
		.selectOption('notrump');
	await page
		.getByRole('combobox', { name: "Declarer's tricks taken", exact: true })
		.selectOption('9');
	await context.setOffline(true);
	await page.getByRole('button', { name: 'Save contract result' }).click();
	await expect(page.getByText(/Player 1 & Player 3: 1 games/)).toBeVisible();
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.getByText(/Player 1 & Player 3: 1 games/)).toHaveCount(0);
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect(page.getByText(/Player 1 & Player 3: 1 games/)).toBeVisible();
	await context.setOffline(false);
	await page.reload();
	await expect(page.getByText(/Player 1 & Player 3: 1 games/)).toBeVisible();
});
test('Solitaire and Palace physical scoring use results, and Palace effects are editable', async ({
	page,
}) => {
	await page.goto('/?ruleset=builtin-solitaire');
	await page.waitForLoadState('networkidle');
	await expect(page.getByPlaceholder('Player 2', { exact: true })).toHaveCount(
		0,
	);
	await page
		.getByRole('button', { name: 'Create session', exact: true })
		.click();
	await page
		.getByRole('button', { name: 'Completed deal (+1)', exact: true })
		.click();
	await expect(page.locator('.score-total')).toHaveText('1');
	await page
		.getByRole('button', { name: 'Close session', exact: true })
		.click();
	await page.goto('/?ruleset=builtin-palace-family');
	await page.waitForLoadState('networkidle');
	await page
		.getByRole('button', { name: 'Create session', exact: true })
		.click();
	await page
		.getByRole('button', { name: 'Save winner (+1)', exact: true })
		.click();
	await expect(page.locator('.score-total').first()).toHaveText('1');
	await page.goto('/play');
	await page.waitForLoadState('networkidle');
	await page
		.getByLabel('Game', { exact: true })
		.selectOption('builtin-palace-family');
	await page.getByText('Customize house rules', { exact: true }).click();
	await page.getByLabel('7 requires the next play to be 7 or lower').uncheck();
	await page
		.getByLabel('Family game name')
		.fill(`Palace QA ${crypto.randomUUID().slice(0, 8)}`);
	await page
		.getByRole('button', { name: 'Save family rules', exact: true })
		.click();
	await expect(
		page.getByText(/It is selected for your next room/),
	).toBeVisible();
});
