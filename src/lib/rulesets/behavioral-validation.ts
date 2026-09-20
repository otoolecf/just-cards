import type { RulePack } from '../scorekeeper/engine';
import {
	applyTableCommand,
	createTable,
	makeDeck,
	projectTable,
	scoreTableRound,
	type TableCard,
	type TableCommand,
	type TableState
} from '../gameplay/table-engine';
import { validateTableRules } from '../gameplay/table-rules';
import type { RuntimeRulesetBundle } from './types';
import { ranks } from './extraction-contract';
export interface BehaviorCheck {
	id: string;
	pass: boolean;
	details: string;
}
export interface SimulationResult {
	seed: number;
	players: number;
	commands: number;
	completed: boolean;
}
export interface BehaviorReport {
	version: 'table-behavior/v1';
	pass: boolean;
	checks: BehaviorCheck[];
	simulations: SimulationResult[];
}
const requireCheck = (condition: unknown, message: string) => {
	if (!condition) throw new Error(message);
};
function seededDeck(seed: number): TableCard[] {
	const deck = makeDeck();
	let n = seed;
	for (let i = 51; i > 0; i--) {
		n = (Math.imul(1664525, n) + 1013904223) >>> 0;
		const j = n % (i + 1);
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
	return deck;
}
/** Separate arithmetic oracle: no cardValue, collection scorer, totals or engine scoring helpers. */
function expectedScore(s: TableState, b: RuntimeRulesetBundle): Record<string, number> {
	const r = b.runtimeRulePack.tableRules!,
		pack = b.runtimeRulePack.scoreRulePack as RulePack;
	const value = (c: TableCard) => (c.rank === 'A' ? pack.baseAceValue : pack.rankValues[c.rank]);
	return Object.fromEntries(
		s.players.map((p) => [
			p,
			r.scoring.zones.reduce((total, z) => {
				const cards =
					z.zone === 'hand'
						? s.hands[p]
						: s.melds.flatMap((m) => m.cards.filter((c) => c.ownerId === p));
				const columns = z.zone === 'hand' ? r.scoring.columnPairs : undefined;
				let sum = 0;
				for (let i = 0; i < cards.length; i++) {
					const paired = columns && cards[i < columns ? i + columns : i - columns];
					if (!paired || cards[i].rank !== paired.rank) sum += value(cards[i]);
				}
				return total + z.multiplier * sum;
			}, 0)
		])
	);
}
function stateInvariant(s: TableState): void {
	const cards = [
		...Object.values(s.hands).flat(),
		...s.stock,
		...s.discard,
		...s.melds.flatMap((m) => m.cards),
		...(s.pending?.card ? [s.pending.card] : [])
	];
	requireCheck(
		cards.length === 52 && new Set(cards.map((c) => c.id)).size === 52,
		'Cards lost or duplicated'
	);
	requireCheck(
		new Set(cards.map((c) => `${c.rank}/${c.suit}`)).size === 52,
		'Card faces lost or duplicated'
	);
	for (const viewer of [s.players[0], 'spectator']) {
		const v = projectTable(s, viewer);
		requireCheck(!('stock' in v), 'Stock leaked');
		for (const player of s.players)
			for (let i = 0; i < s.hands[player].length; i++) {
				const card = s.hands[player][i],
					visible = v.hands[player][i];
				const show =
					s.stage === 'round_end' ||
					s.stage === 'game_end' ||
					card.faceUp ||
					(player === viewer && !s.layout);
				requireCheck(
					show
						? visible.rank === card.rank && visible.suit === card.suit
						: visible.rank === undefined && visible.suit === undefined && visible.id !== card.id,
					'Hand visibility incorrect'
				);
			}
		if (s.pending?.card && s.players[s.turn] !== viewer)
			requireCheck(!v.pending?.card?.rank && !v.pending?.card?.suit, 'Pending draw leaked');
	}
}
function rejected(s: TableState, actor: string, c: TableCommand, b: RuntimeRulesetBundle): void {
	const before = JSON.stringify(s);
	let threw = false;
	try {
		applyTableCommand(s, actor, c, b);
	} catch {
		threw = true;
	}
	requireCheck(threw, 'Illegal action was accepted');
	requireCheck(JSON.stringify(s) === before, 'Rejected action changed state');
}
/** Bounded deterministic actual-engine suite; a behavioral check, not proof of source fidelity. */
export function evaluateTableBehavior(b: RuntimeRulesetBundle): BehaviorReport {
	const report: BehaviorReport = {
		version: 'table-behavior/v1',
		pass: false,
		checks: [],
		simulations: []
	};
	const check = (id: string, fn: () => void, details: string) => {
		try {
			fn();
			report.checks.push({ id, pass: true, details });
		} catch (e) {
			report.checks.push({
				id,
				pass: false,
				details: e instanceof Error ? e.message : 'Check failed'
			});
		}
	};
	check(
		'policy-and-values',
		() => {
			validateTableRules(b.runtimeRulePack.tableRules);
			const p = b.runtimeRulePack.scoreRulePack as RulePack | undefined;
			requireCheck(
				p &&
					ranks.every(
						(r) =>
							Number.isInteger(r === 'A' ? p.baseAceValue : p.rankValues[r]) &&
							Math.abs(r === 'A' ? p.baseAceValue : p.rankValues[r]) <= 100
					),
				'Explicit integer card values required'
			);
			requireCheck(
				!p?.modifiers?.length,
				'Conditional score overrides are outside this extraction contract'
			);
		},
		'Policy, deck capacity and complete rank values validated.'
	);
	if (!report.checks[0].pass) return report;
	const r = b.runtimeRulePack.tableRules!;
	if(r.patience || r.shedding || r.contract){report.checks.push({id:'capability-import-review',pass:false,details:'This capability is available as a curated built-in. Automated imported-policy behavioral review is not yet supported.'});return report;}
	const players = Array.from({ length: r.players.min }, (_, i) => `seat-${i}`);
	const initial = () => createTable(players, b, makeDeck());
	const open = (s: TableState) => {
		if (r.layout)
			for (const p of players)
				for (let slot = 0; slot < r.layout.initialReveals; slot++)
					s = applyTableCommand(s, p, { type: 'reveal', slot }, b);
		return s;
	};
	check(
		'illegal-actions-atomic',
		() => {
			const s = open(initial()),
				actor = s.players[s.turn];
			rejected(s, 'outsider', { type: 'draw', source: 'stock' }, b);
			rejected(s, s.players[(s.turn + 1) % s.players.length], { type: 'draw', source: 'stock' }, b);
			rejected(s, actor, { type: 'discard', cardId: s.hands[actor][0].id }, b);
			const drawn = applyTableCommand(s, actor, { type: 'draw', source: 'stock' }, b);
			rejected(drawn, actor, { type: 'draw', source: 'stock' }, b);
			rejected(
				drawn,
				actor,
				r.layout ? { type: 'swap', slot: 99 } : { type: 'meld', cardIds: ['missing'] },
				b
			);
		},
		'Wrong player, wrong phase and invalid selection reject without mutation.'
	);
	check(
		'independent-scoring',
		() => {
			const s = open(initial());
			// Exercise all ranks, matching columns, signed zones and contributor ownership.
			const cards = makeDeck();
			s.hands[players[0]] = cards.slice(0, 13);
			if (r.scoring.columnPairs) {
				const n = r.scoring.columnPairs;
				s.hands[players[0]] = [...cards.slice(0, n), ...cards.slice(13, 13 + n)];
			}
			if (r.meld)
				s.melds = [
					{
						id: 'fixture',
						cards: cards
							.slice(26, 30)
							.map((c, i) => ({ ...c, ownerId: players[i % players.length], faceUp: true }))
					}
				];
			const actual = scoreTableRound(s, b),
				expected = expectedScore(s, b);
			requireCheck(
				JSON.stringify(actual) === JSON.stringify(expected),
				'Round scoring differs from independent arithmetic'
			);
			if (r.scoring.columnPairs)
				requireCheck(actual[players[0]] === 0, 'Matching column pairs did not cancel');
		},
		'Explicit rank values, column cancellation, signed zones and layoff contributor credit checked by separate arithmetic.'
	);
	check(
		'pickup-and-meld-scenarios',
		() => {
			let s = open(initial()),
				actor = s.players[s.turn];
			if (r.layout) {
				const prior = s.discard.at(-1)!;
				s = applyTableCommand(s, actor, { type: 'draw', source: 'discard' }, b);
				requireCheck(s.pending?.card?.id === prior.id, 'Wrong discard picked');
				s = applyTableCommand(s, actor, { type: 'swap', slot: 0 }, b);
				requireCheck(
					s.hands[actor][0].id === prior.id && s.hands[actor][0].faceUp,
					'Swap did not reveal selected slot'
				);
				stateInvariant(s);
				return;
			}
			// Curated valid suited run and one extension, independent of the engine meld predicate.
			const run = makeDeck()
				.filter((c) => c.suit === 'clubs')
				.slice(0, r.meld!.minRun);
			const extension = makeDeck().find(
				(c) => c.suit === 'clubs' && c.rank === ranks[r.meld!.minRun]
			);
			const anchor = run[0],
				above = makeDeck().find((c) => c.suit === 'hearts' && c.rank === 'K')!;
			const held = [
				...run.slice(1),
				...(extension ? [extension] : []),
				makeDeck().find((c) => c.suit === 'spades' && c.rank === '9')!
			];
			s.hands[actor] = held;
			s.discard = r.discard.pickup === 'suffix' ? [anchor, above] : [anchor];
			const occupied = new Set([...held, ...s.discard].map((c) => c.id));
			for (const p of players.filter((p) => p !== actor)) s.hands[p] = [];
			const spare = makeDeck().filter((c) => !occupied.has(c.id));
			for (const p of players.filter((p) => p !== actor)) s.hands[p] = [spare.pop()!];
			s.stock = spare;
			if (r.discard.immediateUse)
				rejected(s, actor, { type: 'draw', source: 'discard', cardId: anchor.id }, b);
			if (r.discard.pickup === 'top') {
				s.discard.unshift(above);
				s.stock = s.stock.filter((c) => c.id !== above.id);
				rejected(s, actor, { type: 'draw', source: 'discard', cardId: above.id }, b);
			}
			s = applyTableCommand(
				s,
				actor,
				{
					type: 'draw',
					source: 'discard',
					cardId: anchor.id,
					...(r.discard.immediateUse ? { meldCardIds: run.map((c) => c.id) } : {})
				},
				b
			);
			if (!r.discard.immediateUse)
				s = applyTableCommand(s, actor, { type: 'meld', cardIds: run.map((c) => c.id) }, b);
			requireCheck(
				s.melds.length === 1 && s.melds[0].cards.length === run.length,
				'New meld not placed on table'
			);
			if (extension) {
				s = applyTableCommand(
					s,
					actor,
					{ type: 'layoff', meldId: s.melds[0].id, cardIds: [extension.id] },
					b
				);
				requireCheck(s.melds[0].cards.at(-1)?.ownerId === actor, 'Layoff ownership lost');
			}
			stateInvariant(s);
		},
		'Top/suffix pickup, immediate-use rejection, new suited meld, extension and card conservation checked where supported.'
	);
	check(
		'round-and-game-end-scenarios',
		() => {
			let s = open(initial()),
				actor = s.players[s.turn];
			if (r.meld) {
				const deck = makeDeck(),
					run = deck.filter((c) => c.suit === 'clubs').slice(0, r.meld.minRun);
				s.hands[actor] = run;
				const remaining = deck.filter((c) => !run.some((v) => v.id === c.id));
				for (const p of players.filter((p) => p !== actor)) s.hands[p] = [remaining.pop()!];
				s.discard = [remaining.pop()!];
				s.stock = remaining;
				s.stage = 'play';
				s = applyTableCommand(s, actor, { type: 'meld', cardIds: run.map((c) => c.id) }, b);
				requireCheck(
					s.hands[actor].length === 0 && ['round_end', 'game_end'].includes(s.stage),
					'Going out by melding did not end round'
				);
				requireCheck(
					JSON.stringify(s.scores[0]) === JSON.stringify(expectedScore(s, b)),
					'Going-out score mismatch'
				);
				stateInvariant(s);
			}
			s = open(initial());
			actor = s.players[s.turn];
			if (r.scoring.rounds) s.round = r.scoring.rounds;
			if (r.scoring.target)
				s.scores = [Object.fromEntries(players.map((p) => [p, r.scoring.target! + 10000]))];
			// Exhaustion at the end of a legal turn must tally exactly once and decide winners.
			while (s.stock.length > 1) s.discard.push({ ...s.stock.pop()!, faceUp: true });
			s = applyTableCommand(s, actor, { type: 'draw', source: 'stock' }, b);
			s = applyTableCommand(
				s,
				actor,
				{ type: 'discard', ...(r.meld ? { cardId: s.hands[actor].at(-1)!.id } : {}) },
				b
			);
			requireCheck(
				['round_end', 'game_end'].includes(s.stage),
				'Last stock draw did not end after discard'
			);
			requireCheck(
				JSON.stringify(s.scores.at(-1)) === JSON.stringify(expectedScore(s, b)),
				'End-game score mismatch'
			);
			if (r.scoring.rounds || r.scoring.target) {
				requireCheck(s.stage === 'game_end', 'Game limit did not end game');
				const totals = Object.fromEntries(
					players.map((p) => [p, s.scores.reduce((sum, score) => sum + score[p], 0)])
				);
				const best = r.scoring.lowWins
					? Math.min(...Object.values(totals))
					: Math.max(...Object.values(totals));
				requireCheck(
					JSON.stringify(s.winners) === JSON.stringify(players.filter((p) => totals[p] === best)),
					'Final winners incorrect'
				);
			}
			stateInvariant(s);
		},
		'Going out by melding, exhausted stock, cumulative totals and configured game limits are exercised directly.'
	);
	check(
		'seeded-rounds-replay',
		() => {
			for (let count = r.players.min; count <= r.players.max; count++)
				for (const seed of [17, 503]) {
					const seats = Array.from({ length: count }, (_, i) => `p${i}`),
						deck = seededDeck(seed);
					let s = createTable(seats, b, deck);
					const log: { actor: string; command: TableCommand }[] = [];
					const run = (actor: string, command: TableCommand) => {
						log.push({ actor, command });
						s = applyTableCommand(s, actor, command, b);
						stateInvariant(s);
					};
					const expectedDeal = r.deal.byPlayerCount?.[count] ?? r.deal.cardsPerPlayer;
					requireCheck(
						seats.every((p) => s.hands[p].length === expectedDeal),
						'Incorrect deal count'
					);
					stateInvariant(s);
					if (r.layout)
						for (const p of seats)
							for (let slot = 0; slot < r.layout.initialReveals; slot++)
								run(p, { type: 'reveal', slot });
					while (['draw', 'play'].includes(s.stage) && log.length < 256) {
						const actor = s.players[s.turn];
						run(actor, { type: 'draw', source: 'stock' });
						if (r.layout) {
							const slot = seed === 17 ? s.hands[actor].findIndex((c) => !c.faceUp) : -1;
							run(actor, slot >= 0 ? { type: 'swap', slot } : { type: 'discard' });
						} else run(actor, { type: 'discard', cardId: s.hands[actor].at(-1)!.id });
					}
					const completed = s.stage === 'round_end' || s.stage === 'game_end';
					report.simulations.push({ seed, players: count, commands: log.length, completed });
					requireCheck(completed, 'Simulation command limit exceeded');
					requireCheck(
						JSON.stringify(s.scores[0]) === JSON.stringify(expectedScore(s, b)),
						'Final scores disagree with independent oracle'
					);
					requireCheck(s.scores.length === 1, 'Round scored more than once');
					rejected(s, seats[s.turn], { type: 'draw', source: 'stock' }, b);
					let replay = createTable(seats, b, deck);
					for (const { actor, command } of log)
						replay = applyTableCommand(replay, actor, command, b);
					requireCheck(JSON.stringify(replay) === JSON.stringify(s), 'Replay diverged');
					const totals = s.scores[0];
					const shouldEnd = !!(
						(r.scoring.rounds && s.round >= r.scoring.rounds) ||
						(r.scoring.target && Object.values(totals).some((n) => n >= r.scoring.target!))
					);
					requireCheck(
						(s.stage === 'game_end') === shouldEnd,
						'Game ending disagrees with target/round policy'
					);
					if (shouldEnd) {
						const best = r.scoring.lowWins
							? Math.min(...Object.values(totals))
							: Math.max(...Object.values(totals));
						requireCheck(
							JSON.stringify(s.winners) === JSON.stringify(seats.filter((p) => totals[p] === best)),
							'Wrong winner or tie handling'
						);
					} else {
						const next = createTable(seats, b, deck, s);
						requireCheck(
							next.round === 2 &&
								next.dealer === 1 &&
								JSON.stringify(next.scores) === JSON.stringify(s.scores),
							'Next round lost scores or dealer rotation'
						);
					}
				}
		},
		'Two fixed seeds at every supported player count; legal completion, privacy, conservation, independent final scores, replay and next-round/winner transitions.'
	);
	report.pass = report.checks.every((c) => c.pass);
	return report;
}
