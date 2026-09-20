import { describe, expect, it } from 'vitest';
import {
	applyTableCommand,
	createTable,
	makeDeck,
	projectTable,
	scoreTableRound
} from './table-engine';
import { compileRuleFactsToBundle, extractRuleFacts } from '$lib/rulesets/generator';

export const golfText = `Six Card Golf. 2 to 4 players. Standard 52 card deck.
Each player is dealt 6 cards face down. Arrange cards in 2 rows of 3 in front of them and turn 2 of these cards face up.
Remaining cards cannot be looked at. Draw single cards from stock or discard piles.
The drawn card may be swapped for one of the six cards, or discarded.
The round ends when all of a player's cards are face-up. Lowest total score wins after nine deals.
Each ace counts 1 point. Each 2 counts minus 2 points. Each jack or queen scores 10 points. Each king scores zero points.
A pair of equal cards in the same column scores zero points for the column.`;
export const rumText = `500 Rum. 2 to 5 players. Standard 52-card pack.
Deal seven cards to each player except in the two player game, in which each player receives 13 cards.
Sets of 3 or 4 and sequences of 3 or more cards of the same suit. Ace high or low, no wrap.
Draw the top card of stock or any card from the discard pile. Take all the cards above the selected card.
The drawn card must immediately be used in a set or laid off on a set already on the table.
After drawing but before discarding, players may lay down matched sets or lay off cards.
When any player gets rid of all of their cards play immediately ends.
Credit the value of cards showing on the table, subtract the value of cards remaining in their hand.
The first player to reach 500 wins.`;
export const bundleFor = (text: string) =>
	compileRuleFactsToBundle(extractRuleFacts({ sourceText: text }));

describe('executable table primitives', () => {
	it('rejects a grid policy that could consume more than one replacement card', () => {
		const bundle = bundleFor(golfText);
		bundle.runtimeRulePack.tableRules!.discard.pickup = 'suffix';
		expect(() => createTable(['a', 'b'], bundle, makeDeck())).toThrow(/incompatible/i);
	});
	it('finishes exhausted-stock turns, rotates the dealer, and ends after nine deals', () => {
		const bundle = bundleFor(golfText);
		let state = createTable(['a', 'b'], bundle, makeDeck());
		for (let round = 1; round <= 9; round++) {
			for (const player of state.players)
				for (const slot of [0, 1])
					state = applyTableCommand(state, player, { type: 'reveal', slot }, bundle);
			// Exhausted-stock fixture: keep cards in discard so the deck is conserved.
			state.discard.push(...state.stock.splice(1).map((c) => ({ ...c, faceUp: true })));
			const actor = state.players[state.turn];
			state = applyTableCommand(state, actor, { type: 'draw', source: 'stock' }, bundle);
			expect(state.stage).toBe('play');
			expect(() =>
				applyTableCommand(state, actor, { type: 'draw', source: 'stock' }, bundle)
			).toThrow(/already/i);
			state = applyTableCommand(state, actor, { type: 'discard' }, bundle);
			expect(state.scores).toHaveLength(round);
			expect(Object.values(state.hands).flat().length + state.discard.length).toBe(52);
			if (round < 9) {
				const previousDealer = state.dealer;
				state = createTable(state.players, bundle, makeDeck(), state);
				expect(state.dealer).toBe((previousDealer + 1) % 2);
			}
		}
		expect(state.stage).toBe('game_end');
		expect(state.winners.length).toBeGreaterThan(0);
		expect(() => createTable(state.players, bundle, makeDeck(), state)).toThrow(/finish/i);
	});
	it('extracts positional scoring and does not hide a drawn stock card', () => {
		const b = bundleFor(golfText);
		expect(b.runtimeRulePack.tableRules?.layout).toEqual({
			rows: 2,
			columns: 3,
			initialReveals: 2
		});
		expect(b.runtimeRulePack.tableRules?.scoring.columnPairs).toBe(3);
		expect(b.uiProfile.table.zones.find((z) => z.id === 'stock')?.drawVisibility).toBe('reveal');
	});
	it('extracts the two-player deal and net scoring with visible default diagnostics', () => {
		const b = bundleFor(rumText);
		expect(b.runtimeRulePack.tableRules?.deal.byPlayerCount).toEqual({ 2: 13 });
		expect(b.runtimeRulePack.tableRules?.scoring.zones).toEqual([
			{ zone: 'meld', multiplier: 1 },
			{ zone: 'hand', multiplier: -1 }
		]);
		expect(b.explain?.diagnostics.join(' ')).toMatch(/default.*15/i);
	});
	it('keeps layout cards hidden from their owner and stock absent from projections', () => {
		const state = createTable(['a', 'b'], bundleFor(golfText), makeDeck());
		const view = projectTable(state, 'a');
		expect(view.hands.a.every((c) => !('rank' in c))).toBe(true);
		expect('stock' in view).toBe(false);
		expect(view.stockCount).toBe(39);
	});
	it('plays a full grid round with atomic swaps, turn enforcement and automatic scoring', () => {
		const b = bundleFor(golfText);
		let s = createTable(['a', 'b'], b, makeDeck());
		for (const p of s.players)
			for (const slot of [0, 1]) s = applyTableCommand(s, p, { type: 'reveal', slot }, b);
		expect(s.stage).toBe('draw');
		expect(() => applyTableCommand(s, 'a', { type: 'draw', source: 'stock' }, b)).toThrow(/turn/i);
		for (let slot = 2; slot < 6; slot++) {
			const actor = s.players[s.turn];
			s = applyTableCommand(s, actor, { type: 'draw', source: 'stock' }, b);
			const drawn = s.pending!.card!;
			expect(projectTable(s, actor).pending?.card?.rank).toBe(drawn.rank);
			expect(
				projectTable(
					s,
					s.players.find((p) => p !== actor)!
				).pending?.card?.rank
			).toBeUndefined();
			s = applyTableCommand(s, actor, { type: 'swap', slot }, b);
			expect(s.hands[actor][slot].id).toBe(drawn.id);
			expect(s.hands[actor]).toHaveLength(6);
			if (s.stage === 'round_end') break;
			const next = s.players[s.turn];
			s = applyTableCommand(s, next, { type: 'draw', source: 'stock' }, b);
			s = applyTableCommand(s, next, { type: 'discard' }, b);
		}
		expect(s.stage).toBe('round_end');
		expect(s.scores).toEqual([scoreTableRound(s, b)]);
		const all = [...Object.values(s.hands).flat(), ...s.stock, ...s.discard];
		expect(new Set(all.map((c) => c.id)).size).toBe(52);
		expect(() => applyTableCommand(s, 'b', { type: 'discard' }, b)).toThrow();
	});
	it('cancels equal columns including twos without cancelling unrelated pairs', () => {
		const b = bundleFor(golfText);
		const s = createTable(['a', 'b'], b, makeDeck());
		s.hands.a = ['2', 'K', 'Q', '2', 'A', 'Q'].map((rank, i) => ({
			id: `${i}`,
			rank,
			suit: 'clubs',
			faceUp: true
		})) as typeof s.hands.a;
		expect(scoreTableRound(s, b).a).toBe(1);
	});
	it('allows multiple melds and validates pickup before consuming a discard', () => {
		const b = bundleFor(rumText);
		let s = createTable(['a', 'b'], b, makeDeck());
		expect(s.hands.a).toHaveLength(13);
		const c = (rank: string, suit = 'clubs') => ({
			id: `${rank}-${suit}`,
			rank,
			suit,
			faceUp: true
		});
		s.hands.b = [
			c('3'),
			c('4'),
			c('8'),
			c('8', 'hearts'),
			c('8', 'spades'),
			c('K')
		] as typeof s.hands.b;
		s.discard = [c('5'), c('9')] as typeof s.discard;
		const before = structuredClone(s);
		expect(() =>
			applyTableCommand(s, 'b', { type: 'draw', source: 'discard', cardId: '5-clubs' }, b)
		).toThrow(/meld|use/i);
		expect(s).toEqual(before);
		s = applyTableCommand(
			s,
			'b',
			{
				type: 'draw',
				source: 'discard',
				cardId: '5-clubs',
				meldCardIds: ['3-clubs', '4-clubs', '5-clubs']
			},
			b
		);
		expect(s.discard).toHaveLength(0);
		expect(s.hands.b.some((c) => c.id === '9-clubs')).toBe(true);
		s = applyTableCommand(
			s,
			'b',
			{ type: 'meld', cardIds: ['8-clubs', '8-hearts', '8-spades'] },
			b
		);
		expect(s.stage).toBe('play');
		s = applyTableCommand(s, 'b', { type: 'discard', cardId: 'K-clubs' }, b);
		expect(s.players[s.turn]).toBe('a');
	});
	it('accepts ace at either run end, rejects wrapping, and credits foreign layoffs to contributor', () => {
		const b = bundleFor(rumText);
		let s = createTable(['a', 'b'], b, makeDeck());
		const cards = (ranks: string[]) =>
			ranks.map((rank) => ({
				id: rank,
				rank,
				suit: 'hearts',
				faceUp: true
			})) as typeof s.hands.b;
		s.stage = 'play';
		s.hands.b = cards(['Q', 'K', 'A', '2']);
		expect(() => applyTableCommand(s, 'b', { type: 'meld', cardIds: ['K', 'A', '2'] }, b)).toThrow(
			/meld/i
		);
		s = applyTableCommand(s, 'b', { type: 'meld', cardIds: ['Q', 'K', 'A'] }, b);
		s = applyTableCommand(s, 'b', { type: 'discard', cardId: '2' }, b);
		expect(s.stage).toBe('round_end');
		s = createTable(['a', 'b'], b, makeDeck());
		s.stage = 'play';
		s.hands.b = cards(['3', '4', '5', '9']);
		s = applyTableCommand(s, 'b', { type: 'meld', cardIds: ['3', '4', '5'] }, b);
		s = applyTableCommand(s, 'b', { type: 'discard', cardId: '9' }, b);
		// Separate hand fixture for a foreign layoff with a remaining card.
		s.stage = 'play';
		s.turn = 0;
		s.scores = [];
		s.hands.a = cards(['6', '10']);
		s = applyTableCommand(s, 'a', { type: 'layoff', cardIds: ['6'], meldId: s.melds[0].id }, b);
		expect(s.melds[0].cards.find((c) => c.id === '6')?.ownerId).toBe('a');
		expect(scoreTableRound(s, b).a).toBe(-4);
	});
});
