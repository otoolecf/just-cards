import { test, expect, type Page, type Locator } from '@playwright/test';
import { findMeld, canMeldCards } from '../../src/lib/gameplay/table-presentation';
import type { RoomView } from '../../src/lib/server/room-service';
import type { VisibleCard } from '../../src/lib/gameplay/table-engine';

test('Worker streams private views, reconnects, and completes a Rummy round through the UI', async ({
	browser
}) => {
	test.skip(process.env.CF_INTEGRATION !== '1', 'Runs against the built Cloudflare Worker');
	test.setTimeout(120_000);
	const first = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const second = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const host = await first.newPage(),
		guest = await second.newPage();
	const frames: RoomView[] = [];
	for (const page of [host, guest])
		page.on('websocket', (ws) =>
			ws.on('framereceived', ({ payload }) => {
				try {
					const value = JSON.parse(String(payload));
					if (value.type === 'view') frames.push(value.room);
				} catch {
					/* heartbeat */
				}
			})
		);
	await host.goto('/play');
	await host.waitForLoadState('networkidle');
	await host.getByLabel('Game', { exact: true }).selectOption('builtin-500-rum');
	await host.getByLabel('Your name', { exact: true }).fill('Parent');
	await host.getByRole('button', { name: 'Create room', exact: true }).click();
	await expect(host.getByText('Live', { exact: true })).toBeVisible();
	const code = await host.getByTestId('room-code').innerText();
	await guest.goto(host.url());
	await guest.getByLabel('Your name', { exact: true }).fill('Child');
	await guest.getByRole('button', { name: 'Join room', exact: true }).click();
	await expect(guest.getByText('Live', { exact: true })).toBeVisible();
	await expect(host.getByText('Child', { exact: true })).toBeVisible();
	async function click(page: Page, button: Locator): Promise<RoomView> {
		const response = page.waitForResponse(
			(r) => r.url().endsWith(`/api/rooms/${code}`) && r.request().method() === 'POST'
		);
		await button.click();
		const received = await response;
		expect(received.ok(), await received.text()).toBe(true);
		return await received.json();
	}
	async function view(page: Page): Promise<RoomView> {
		const token = await page.evaluate((code) => localStorage.getItem(`jc-seat-${code}`), code);
		const response = await page.request.get(`/api/rooms/${code}`, {
			headers: { authorization: `Bearer ${token}` }
		});
		return await response.json();
	}
	async function select(page: Page, state: RoomView, ids: string[]) {
		for (const id of ids) {
			const hand = state.table!.hands[state.selfId!];
			const area = hand.some((c) => c.id === id)
				? page.getByTestId('my-hand')
				: page.locator('.pickup');
			await area.locator(`button[data-card-id="${id}"]`).click();
		}
	}
	await click(host, host.getByRole('button', { name: 'Deal cards', exact: true }));
	let state = await view(guest);
	const policy = state.rules.meld!;
	expect(state.table!.hands[state.selfId!]).toHaveLength(13);
	await guest.reload();
	await expect(guest.getByText('Live', { exact: true })).toBeVisible();
	const seats = new Map([
		[(await view(host)).selfId!, host],
		[state.selfId!, guest]
	]);
	let meldCount = 0,
		layoffCount = 0,
		pickupCount = 0;
	for (let turn = 0; turn < 100; turn++) {
		if (['round_end', 'game_end'].includes(state.table!.stage)) break;
		const page = seats.get(state.table!.players[state.table!.turn])!;
		state = await view(page);
		const hand = state.table!.hands[state.selfId!];
		let picked: { card: VisibleCard; ids: string[] } | undefined;
		for (let i = 0; i < state.table!.discard.length; i++) {
			const card = state.table!.discard[i];
			const ids = findMeld([...hand, ...state.table!.discard.slice(i)], policy, card.id);
			if (ids) {
				picked = { card, ids };
				break;
			}
		}
		if (picked) {
			await page
				.locator('.discard-row')
				.locator(`button[data-card-id="${picked.card.id}"]`)
				.click();
			await select(
				page,
				state,
				picked.ids.filter((id) => id !== picked!.card.id)
			);
			state = await click(page, page.getByRole('button', { name: 'Pick up & play new meld', exact: true }));
			pickupCount++;
			meldCount++;
		} else state = await click(page, page.getByRole('button', { name: /Draw from stock/ }));
		while (state.table!.stage === 'play') {
			const ids = findMeld(state.table!.hands[state.selfId!], policy);
			if (!ids) break;
			await select(page, state, ids);
			state = await click(page, page.getByRole('button', { name: 'Play new meld', exact: true }));
			meldCount++;
		}
		while (state.table!.stage === 'play') {
			const target = state.table!.melds.flatMap((m, i) =>
				state
					.table!.hands[state.selfId!].filter((c) => canMeldCards([...m.cards, c], policy))
					.map((c) => ({ c, i }))
			)[0];
			if (!target) break;
			await select(page, state, [target.c.id]);
			state = await click(
				page,
				page.getByRole('button', { name: 'Add to this meld', exact: true }).nth(target.i)
			);
			layoffCount++;
		}
		if (state.table!.stage === 'play') {
			const discard = [...state.table!.hands[state.selfId!]].sort(
				(a, b) => state.cardValues[b.rank!] - state.cardValues[a.rank!]
			)[0];
			await select(page, state, [discard.id]);
			state = await click(
				page,
				page.getByRole('button', { name: 'Discard selected', exact: true })
			);
		}
	}
	expect(state.table!.stage).toBe('round_end');
	expect(meldCount).toBeGreaterThan(0);
	for (const player of state.table!.players) {
		const onTable = state.table!.melds.flatMap((m) => m.cards.filter((c) => c.ownerId === player));
		const expected =
			onTable.reduce((n, c) => n + state.cardValues[c.rank], 0) -
			state.table!.hands[player].reduce((n, c) => n + state.cardValues[c.rank!], 0);
		expect(state.table!.scores[0][player]).toBe(expected);
	}
	for (const frame of frames) {
		if (!frame.table || ['round_end', 'game_end'].includes(frame.table.stage)) continue;
		expect(frame.table).not.toHaveProperty('stock');
		expect(frame).not.toHaveProperty('events');
		for (const [player, hand] of Object.entries(frame.table.hands))
			if (player !== frame.selfId) expect(hand.every((c) => !c.rank && !c.suit)).toBe(true);
	}
	await expect(host.getByRole('heading', { name: 'Round scores', exact: true })).toBeVisible();
	await expect(guest.getByRole('heading', { name: 'Round scores', exact: true })).toBeVisible();
	console.log(
		`Rummy round: ${meldCount} melds, ${layoffCount} layoffs, ${pickupCount} discard pickups; ${frames.length} private socket views checked.`
	);
	await first.close();
	await second.close();
});
