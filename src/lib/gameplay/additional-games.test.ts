import { expect, it } from 'vitest';
import { familyRulesets } from '../rulesets/family-presets';
import {
	createTable,
	makeDeck,
	applyTableCommand,
	projectTable,
} from './table-engine';
import { scoreContract, emptyRubber } from './contract-scoring';
const bundle = (id: string) =>
	familyRulesets().find((r) => r.id === id)!.bundle;
it('deals solitaire privately and permits stock draw/recycle', () => {
	const b = bundle('builtin-solitaire'),
		s = createTable(['solo'], b, makeDeck());
	expect(s.patience!.tableau.map((p) => p.length)).toEqual([
		1, 2, 3, 4, 5, 6, 7,
	]);
	expect(s.stock).toHaveLength(24);
	expect(
		projectTable(s, 'solo').patience!.tableau[6].filter((c) => c.rank),
	).toHaveLength(1);
	const drawn = applyTableCommand(s, 'solo', { type: 'patience_draw' }, b);
	expect(drawn.stock).toHaveLength(23);
	expect(drawn.discard).toHaveLength(1);
	expect(() =>
		applyTableCommand(
			s,
			'solo',
			{
				type: 'patience_move',
				from: { zone: 'tableau', index: 6 },
				cardId: s.patience!.tableau[6][0].id,
				to: { zone: 'foundation', index: 0 },
			},
			b,
		),
	).toThrow();
});
it('deals a Palace table without revealing blind cards to their owner', () => {
	const b = bundle('builtin-palace-family'),
		s = createTable(['a', 'b'], b, makeDeck());
	expect(s.hands.a).toHaveLength(6);
	expect(s.shedding!.down.a).toHaveLength(3);
	expect(projectTable(s, 'a').shedding!.down.a.every((c) => !c.rank)).toBe(
		true,
	);
	const ready = applyTableCommand(
		s,
		'a',
		{ type: 'shedding_setup', cardIds: s.hands.a.slice(0, 3).map((c) => c.id) },
		b,
	);
	expect(ready.shedding!.up.a).toHaveLength(3);
	expect(ready.hands.a).toHaveLength(3);
});
it('Bridge deals all cards, auctions and exposes dummy only after the opening lead', () => {
	const b = bundle('builtin-bridge'),
		players = ['N', 'E', 'S', 'W'];
	let s = createTable(players, b, makeDeck());
	expect(s.stock).toHaveLength(0);
	expect(s.hands.N).toHaveLength(13);
	s = applyTableCommand(
		s,
		'N',
		{ type: 'contract_call', call: 'bid', level: 1, strain: 'notrump' },
		b,
	);
	for (const p of ['E', 'S', 'W'])
		s = applyTableCommand(s, p, { type: 'contract_call', call: 'pass' }, b);
	expect(s.contract!.declarer).toBe('N');
	expect(s.contract!.dummy).toBe('S');
	expect(s.players[s.turn]).toBe('E');
	expect(projectTable(s, 'N').hands.S.every((c) => !c.rank)).toBe(true);
	s = applyTableCommand(
		s,
		'E',
		{ type: 'trick_play', cardId: s.hands.E[0].id },
		b,
	);
	expect(projectTable(s, 'N').hands.S.every((c) => c.rank)).toBe(true);
	expect(() =>
		applyTableCommand(
			s,
			'S',
			{ type: 'trick_play', cardId: s.hands.S[0].id },
			b,
		),
	).toThrow(/declarer/i);
});
it('scores contracts, vulnerable penalties, games and rubbers independently of card values', () => {
	let result = scoreContract(emptyRubber(), {
		team: 0,
		level: 3,
		strain: 'notrump',
		doubling: 1,
		tricks: 9,
	});
	expect(result.delta).toEqual([100, 0]);
	expect(result.state.games).toEqual([1, 0]);
	result = scoreContract(result.state, {
		team: 0,
		level: 4,
		strain: 'spades',
		doubling: 2,
		tricks: 8,
	});
	expect(result.delta).toEqual([0, 500]);
	result = scoreContract(result.state, {
		team: 0,
		level: 4,
		strain: 'spades',
		doubling: 1,
		tricks: 10,
	});
	expect(result.delta).toEqual([820, 0]);
	expect(result.state.finished).toBe(true);
});
import {
	createRulePack,
	deriveState,
	type ScoreEvent,
} from '../scorekeeper/engine';
it('replays physical Bridge contract entries and undo/redo with vulnerability', () => {
	const events: ScoreEvent[] = [
		{
			type: 'add_contract',
			players: ['N', 'E', 'S', 'W'],
			result: { team: 0, level: 3, strain: 'notrump', doubling: 1, tricks: 9 },
		},
		{
			type: 'add_contract',
			players: ['N', 'E', 'S', 'W'],
			result: { team: 0, level: 4, strain: 'spades', doubling: 2, tricks: 8 },
		},
	];
	expect(deriveState(events, createRulePack()).totalsByPlayer).toEqual({
		N: 100,
		E: 500,
		S: 100,
		W: 500,
	});
	const undone = deriveState([...events, { type: 'undo' }], createRulePack());
	expect(undone.rubber!.games).toEqual([1, 0]);
	expect(undone.totalsByPlayer.E).toBe(0);
	expect(
		deriveState(
			[...events, { type: 'undo' }, { type: 'redo' }],
			createRulePack(),
		).totalsByPlayer.E,
	).toBe(500);
});
import { validateTableRules, deckCountFor } from './table-rules';
import { canShed } from './additional-table';
import type { TableState, TableCard, TableCommand } from './table-engine';
import { createRulesetStore } from '../rulesets/store';
import { createRulesetService } from '../rulesets/service';
import { evaluateTableBehavior } from '../rulesets/behavioral-validation';
import { createHouseRules, houseRuleSettings } from '../rulesets/house-rules';
const face = (rank: TableCard['rank'], suit: TableCard['suit'] = 'clubs') => ({
	...makeDeck().find((c) => c.rank === rank && c.suit === suit)!,
	faceUp: true,
});
function allCards(s: TableState) {
	return [
		...Object.values(s.hands).flat(),
		...s.stock,
		...s.discard,
		...s.melds.flatMap((m) => m.cards),
		...(s.patience
			? [...s.patience.tableau.flat(), ...s.patience.foundations.flat()]
			: []),
		...(s.shedding
			? [
					...Object.values(s.shedding.up).flat(),
					...Object.values(s.shedding.down).flat(),
					...s.shedding.burned,
				]
			: []),
		...(s.contract
			? [...s.contract.played, ...s.contract.trick.map((p) => p.card)]
			: []),
	];
}
function invariant(s: TableState, count = 52) {
	const cards = allCards(s);
	expect(cards).toHaveLength(count);
	expect(new Set(cards.map((c) => c.id)).size).toBe(count);
}
it('stores each curated capability bundle through the normal service and refuses incompatible policies', async () => {
	const service = createRulesetService(
		await createRulesetStore({ driver: 'memory' }),
	);
	for (const preset of familyRulesets().slice(2)) {
		await expect(service.createDraft(preset)).resolves.toMatchObject({
			name: preset.name,
		});
		const r = structuredClone(preset.bundle.runtimeRulePack.tableRules!);
		r.meld = { minSet: 3, maxSet: 4, minRun: 3, ace: 'both' };
		expect(() => validateTableRules(r)).toThrow();
		expect(evaluateTableBehavior(preset.bundle).pass).toBe(false); // imported policy cannot borrow the old grid/meld review
	}
});
it('supports explicit Palace effect switches in saved family copies', () => {
	const preset = familyRulesets().find(
			(r) => r.id === 'builtin-palace-family',
		)!,
		settings = houseRuleSettings(preset.bundle);
	settings.shedding!.lowSeven = false;
	settings.shedding!.forcePickupThree = false;
	const b = createHouseRules(preset, 'Our simple Palace', settings);
	expect(b.runtimeRulePack.tableRules!.shedding!.lowSeven).toBe(false);
	expect(b.displayName).toBe('Our simple Palace');
	expect(preset.bundle.runtimeRulePack.tableRules!.shedding!.lowSeven).toBe(
		true,
	);
});
it('enforces Palace specials, compulsory pickup and failed blind pickup', () => {
	const b = bundle('builtin-palace-family'),
		r = b.runtimeRulePack.tableRules!.shedding!;
	expect(canShed(face('3'), face('Q'), r)).toBe(false);
	expect(canShed(face('10'), face('7'), r)).toBe(true);
	expect(canShed(face('8'), face('7'), r)).toBe(false);
	expect(canShed(face('A'), face('2'), r)).toBe(true);
	const setup = () => {
		let s = createTable(['a', 'b'], b, makeDeck());
		for (const id of s.players)
			s = applyTableCommand(
				s,
				id,
				{
					type: 'shedding_setup',
					cardIds: s.hands[id].slice(0, 3).map((c) => c.id),
				},
				b,
			);
		s.turn = 0;
		s.stock = [];
		return s;
	};
	let s = setup();
	s.hands.a = [face('3'), face('9')];
	s.discard = [face('2')];
	const prior = s.hands.b.length;
	s = applyTableCommand(
		s,
		'a',
		{ type: 'shedding_play', cardIds: [face('3').id] },
		b,
	);
	expect(s.hands.b).toHaveLength(prior + 2);
	expect(s.discard).toHaveLength(0);
	expect(s.turn).toBe(0);
	s = setup();
	s.hands.a = [face('10'), face('9')];
	s.discard = [face('A')];
	s = applyTableCommand(
		s,
		'a',
		{ type: 'shedding_play', cardIds: [face('10').id] },
		b,
	);
	expect(s.shedding!.burned).toHaveLength(2);
	expect(s.turn).toBe(0);
	s = setup();
	s.hands.a = [face('5')];
	s.discard = [face('4')];
	expect(() =>
		applyTableCommand(s, 'a', { type: 'shedding_pickup' }, b),
	).toThrow(/legal/);
	s.hands.a = [];
	s.shedding!.up.a = [];
	s.shedding!.down.a = [{ ...face('3'), faceUp: false }];
	s.discard = [face('K')];
	s = applyTableCommand(s, 'a', { type: 'shedding_blind', slot: 0 }, b);
	expect(s.hands.a.map((c) => c.rank)).toEqual(['K', '3']);
	expect(s.turn).toBe(1);
	expect(s.stage).toBe('play');
	s = setup();
	s.hands.a = [face('8', 'spades'), face('9')];
	s.discard = ['clubs', 'diamonds', 'hearts'].map((suit) =>
		face('8', suit as TableCard['suit']),
	);
	s = applyTableCommand(
		s,
		'a',
		{ type: 'shedding_play', cardIds: [face('8', 'spades').id] },
		b,
	);
	expect(s.shedding!.burned).toHaveLength(4);
	expect(s.turn).toBe(1);
});
it('checks Solitaire destinations, sequences, recycle order and win/concede', () => {
	const b = bundle('builtin-solitaire');
	let s = createTable(['solo'], b, makeDeck());
	const order = s.stock.map((c) => c.id);
	while (s.stock.length)
		s = applyTableCommand(s, 'solo', { type: 'patience_draw' }, b);
	s = applyTableCommand(s, 'solo', { type: 'patience_draw' }, b);
	expect(s.stock.map((c) => c.id)).toEqual(order);
	invariant(s);
	s.patience!.tableau = [
		[face('K', 'hearts'), face('Q', 'clubs')],
		[face('K', 'clubs')],
		[],
		[],
		[],
		[],
		[],
	];
	s.patience!.foundations = [[], [], [], []];
	expect(() =>
		applyTableCommand(
			s,
			'solo',
			{
				type: 'patience_move',
				from: { zone: 'tableau', index: 0 },
				cardId: face('Q', 'clubs').id,
				to: { zone: 'tableau', index: 1 },
			},
			b,
		),
	).toThrow(/alternating/);
	s = applyTableCommand(
		s,
		'solo',
		{
			type: 'patience_move',
			from: { zone: 'tableau', index: 0 },
			cardId: face('K', 'hearts').id,
			to: { zone: 'tableau', index: 2 },
		},
		b,
	);
	expect(s.patience!.tableau[2]).toHaveLength(2);
	const deck = makeDeck().map((c) => ({ ...c, faceUp: true }));
	s.stock = [];
	s.discard = [];
	s.patience!.tableau = [[face('K', 'spades')], [], [], [], [], [], []];
	s.patience!.foundations = ['clubs', 'diamonds', 'hearts', 'spades'].map(
		(suit) =>
			deck.filter(
				(c) => c.suit === suit && !(suit === 'spades' && c.rank === 'K'),
			),
	);
	s = applyTableCommand(
		s,
		'solo',
		{
			type: 'patience_move',
			from: { zone: 'tableau', index: 0 },
			cardId: face('K', 'spades').id,
			to: { zone: 'foundation', index: 3 },
		},
		b,
	);
	expect(s.stage).toBe('game_end');
	expect(s.scores).toEqual([{ solo: 1 }]);
	invariant(s);
	expect(
		applyTableCommand(
			createTable(['solo'], b, makeDeck()),
			'solo',
			{ type: 'patience_concede' },
			b,
		).scores,
	).toEqual([{ solo: 0 }]);
});
it('completes and deterministically replays Palace deals at every player count with conserved cards', () => {
	for (const preset of ['builtin-palace', 'builtin-palace-family'])
		for (const n of [2, 3, 4, 5]) {
			const b = bundle(preset),
				r = b.runtimeRulePack.tableRules!,
				players = Array.from({ length: n }, (_, i) => `p${i}`),
				deck = makeDeck(deckCountFor(r, n));
			// Fixed shuffle avoids a pathological sorted multi-deck fixture.
			let seed = 179;
			for (let i = deck.length - 1; i > 0; i--) {
				seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
				const j = seed % (i + 1);
				[deck[i], deck[j]] = [deck[j], deck[i]];
			}
			let s = createTable(players, b, deck);
			const log: { actor: string; command: TableCommand }[] = [];
			const run = (actor: string, command: TableCommand) => {
				log.push({ actor, command });
				s = applyTableCommand(s, actor, command, b);
				invariant(s, deck.length);
			};
			for (const id of players)
				run(id, {
					type: 'shedding_setup',
					cardIds: s.hands[id].slice(0, 3).map((c) => c.id),
				});
			while (s.stage !== 'game_end' && log.length < 3000) {
				const actor = players[s.turn],
					active = s.hands[actor].length
						? s.hands[actor]
						: s.shedding!.up[actor];
				const card = active.find((c) =>
					canShed(c, s.discard.at(-1), r.shedding!),
				);
				run(
					actor,
					card
						? {
								type: 'shedding_play',
								cardIds: active
									.filter((c) => c.rank === card.rank)
									.map((c) => c.id),
							}
						: active.length
							? { type: 'shedding_pickup' }
							: { type: 'shedding_blind', slot: 0 },
				);
			}
			expect(s.stage).toBe('game_end');
			expect(s.winners).toHaveLength(1);
			expect(Object.values(s.scores[0]).reduce((n, v) => n + v, 0)).toBe(1);
			let replay = createTable(players, b, deck);
			for (const row of log)
				replay = applyTableCommand(replay, row.actor, row.command, b);
			expect(replay).toEqual(s);
		}
});
it('enforces Bridge calls/follow-suit and replays all thirteen tricks with private honors', () => {
	const b = bundle('builtin-bridge'),
		players = ['N', 'E', 'S', 'W'];
	let s = createTable(players, b, makeDeck());
	const log: { actor: string; command: TableCommand }[] = [];
	const run = (actor: string, command: TableCommand) => {
		log.push({ actor, command });
		s = applyTableCommand(s, actor, command, b);
		invariant(s);
	};
	expect(() =>
		applyTableCommand(s, 'N', { type: 'contract_call', call: 'double' }, b),
	).toThrow();
	run('N', { type: 'contract_call', call: 'bid', level: 1, strain: 'spades' });
	run('E', { type: 'contract_call', call: 'double' });
	run('S', { type: 'contract_call', call: 'redouble' });
	run('W', { type: 'contract_call', call: 'pass' });
	run('N', { type: 'contract_call', call: 'pass' });
	run('E', { type: 'contract_call', call: 'pass' });
	expect(s.contract!.declarer).toBe('N');
	expect(projectTable(s, 'E').contract!.honors).toEqual([0, 0]);
	let rejectedFollow = false;
	while (s.stage === 'play') {
		const seat = players[s.turn],
			actor = seat === s.contract!.dummy ? s.contract!.declarer! : seat,
			hand = s.hands[seat],
			lead = s.contract!.trick[0]?.card;
		const legal = hand.find((c) => c.suit === lead?.suit) ?? hand[0];
		const illegal =
			lead && hand.some((c) => c.suit === lead.suit)
				? hand.find((c) => c.suit !== lead.suit)
				: undefined;
		if (illegal) {
			const before = JSON.stringify(s);
			expect(() =>
				applyTableCommand(
					s,
					actor,
					{ type: 'trick_play', cardId: illegal.id },
					b,
				),
			).toThrow(/Follow/);
			expect(JSON.stringify(s)).toBe(before);
			rejectedFollow = true;
		}
		run(actor, { type: 'trick_play', cardId: legal.id });
	}
	expect(rejectedFollow).toBe(true);
	expect(s.contract!.tricks.reduce((n, v) => n + v, 0)).toBe(13);
	expect(s.scores).toHaveLength(1);
	let replay = createTable(players, b, makeDeck());
	for (const row of log)
		replay = applyTableCommand(replay, row.actor, row.command, b);
	expect(replay).toEqual(s);
	const next = createTable(players, b, makeDeck(), s);
	expect(next.contract!.rubber).toEqual(s.contract!.rubber);
	expect(next.dealer).toBe(1);
	expect(() => createTable(['N', 'E', 'S', 'X'], b, makeDeck(), s)).toThrow(
		/partnership/,
	);
});
it('scores rubber-specific part games, doubling, honors and slam arithmetic', () => {
	const score = (
		input: Parameters<typeof scoreContract>[1],
		games: [number, number] = [0, 0],
	) => scoreContract({ ...emptyRubber(), games }, input);
	expect(
		score({ team: 0, level: 2, strain: 'clubs', doubling: 1, tricks: 9 }).delta,
	).toEqual([60, 0]);
	expect(
		score({ team: 0, level: 2, strain: 'hearts', doubling: 2, tricks: 9 })
			.delta,
	).toEqual([270, 0]);
	expect(
		score(
			{ team: 0, level: 2, strain: 'hearts', doubling: 4, tricks: 9 },
			[1, 1],
		).delta,
	).toEqual([1240, 0]); // 240 below +400 over +100 insult +500 rubber
	expect(
		score({ team: 0, level: 6, strain: 'notrump', doubling: 1, tricks: 12 })
			.delta,
	).toEqual([690, 0]);
	expect(
		score(
			{
				team: 0,
				level: 7,
				strain: 'spades',
				doubling: 1,
				tricks: 13,
				honors: [0, 150],
			},
			[1, 1],
		).delta,
	).toEqual([2210, 150]);
	expect(
		score({ team: 0, level: 4, strain: 'spades', doubling: 2, tricks: 6 })
			.delta,
	).toEqual([0, 800]);
	expect(
		score(
			{ team: 0, level: 4, strain: 'spades', doubling: 4, tricks: 7 },
			[1, 0],
		).delta,
	).toEqual([0, 1600]);
	let a = score({
		team: 0,
		level: 2,
		strain: 'hearts',
		doubling: 1,
		tricks: 8,
	}).state;
	a = scoreContract(a, {
		team: 1,
		level: 1,
		strain: 'clubs',
		doubling: 1,
		tricks: 7,
	}).state;
	expect(a.below).toEqual([60, 20]);
	a = scoreContract(a, {
		team: 0,
		level: 2,
		strain: 'clubs',
		doubling: 1,
		tricks: 8,
	}).state;
	expect(a.below).toEqual([0, 0]);
	expect(a.games).toEqual([1, 0]);
});
it('awards tricks to highest trump, otherwise highest led suit, and retains first strain bidder', () => {
	const b = bundle('builtin-bridge'),
		players = ['N', 'E', 'S', 'W'];
	let s = createTable(players, b, makeDeck());
	for (const [actor, command] of [
		['N', { type: 'contract_call', call: 'bid', level: 1, strain: 'hearts' }],
		['E', { type: 'contract_call', call: 'pass' }],
		['S', { type: 'contract_call', call: 'bid', level: 2, strain: 'hearts' }],
		['W', { type: 'contract_call', call: 'pass' }],
		['N', { type: 'contract_call', call: 'pass' }],
		['E', { type: 'contract_call', call: 'pass' }],
	] as [string, TableCommand][])
		s = applyTableCommand(s, actor, command, b);
	expect(s.contract!.declarer).toBe('N');
	s.hands = {
		N: [face('2', 'hearts')],
		E: [face('A', 'clubs')],
		S: [face('K', 'clubs')],
		W: [face('A', 'spades')],
	};
	for (const seat of ['E', 'S', 'W', 'N'])
		s = applyTableCommand(
			s,
			seat === 'S' ? 'N' : seat,
			{ type: 'trick_play', cardId: s.hands[seat][0].id },
			b,
		);
	expect(s.players[s.turn]).toBe('N');
	expect(s.contract!.tricks).toEqual([1, 0]);
	s.hands = {
		N: [face('K', 'clubs')],
		E: [face('A', 'clubs')],
		S: [face('A', 'spades')],
		W: [face('Q', 'clubs')],
	};
	for (const seat of ['N', 'E', 'S', 'W'])
		s = applyTableCommand(
			s,
			seat === 'S' ? 'N' : seat,
			{ type: 'trick_play', cardId: s.hands[seat][0].id },
			b,
		);
	expect(s.players[s.turn]).toBe('E');
	expect(s.contract!.tricks).toEqual([1, 1]);
});
it('passes out without advancing game scores and makes the next dealer open the next auction', () => {
	const b = bundle('builtin-bridge'),
		players = ['N', 'E', 'S', 'W'];
	let s = createTable(players, b, makeDeck());
	for (const actor of players)
		s = applyTableCommand(s, actor, { type: 'contract_call', call: 'pass' }, b);
	expect(s.stage).toBe('round_end');
	expect(s.scores).toEqual([{ N: 0, E: 0, S: 0, W: 0 }]);
	s = createTable(players, b, makeDeck(), s);
	expect(s.dealer).toBe(1);
	expect(s.turn).toBe(1);
});
