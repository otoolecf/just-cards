import { createMahjongTable, applyMahjong, projectMahjong, type MahjongState, type MahjongView, type TileCommand } from './mahjong-table';
import type { Tile } from './mahjong';
import { createAdditional, applyAdditional, projectAdditional, type AdditionalCommand, type PatienceState, type SheddingState, type ContractState } from './additional-table';
import { deckCountFor } from './table-rules';
import { validMeld } from './meld-rules';
export { validMeld } from './meld-rules';
import { scoreCardCollection } from '../scorekeeper/collection-scoring';
import {
	createRulePack,
	type CardRank,
	type CardSuit,
	type RulePack,
} from '../scorekeeper/engine';
import type { RuntimeRulesetBundle } from '../rulesets/types';
import { validateTableRules, type TableRules } from './table-rules';

export interface TableCard {
	id: string;
	rank: CardRank;
	suit: CardSuit;
	faceUp: boolean;
}
export interface TableMeld {
	id: string;
	cards: (TableCard & { ownerId: string })[];
}
export type TableCommand = AdditionalCommand | TileCommand
	| { type: 'reveal'; slot: number }
	| {
			type: 'draw';
			source: 'stock' | 'discard';
			cardId?: string;
			meldCardIds?: string[];
			meldId?: string;
	  }
	| { type: 'swap'; slot: number }
	| { type: 'discard'; cardId?: string }
	| { type: 'meld'; cardIds: string[] }
	| { type: 'layoff'; cardIds: string[]; meldId: string };
export interface TableState {
 mahjong?:MahjongState;
 patience?:PatienceState; shedding?:SheddingState; contract?:ContractState;
	layout?: { rows: number; columns: number; initialReveals: number };
	players: string[];
	round: number;
	dealer: number;
	turn: number;
	stage: 'setup' | 'draw' | 'play' | 'round_end' | 'game_end';
	hands: Record<string, TableCard[]>;
	stock: TableCard[];
	discard: TableCard[];
	melds: TableMeld[];
	pending?: { card?: TableCard };
	scores: Record<string, number>[];
	winners: string[];
}
export type VisibleCard = {
	id: string;
	faceUp: boolean;
	rank?: CardRank;
	suit?: CardSuit;
};
export type TableView = Omit<TableState, 'stock' | 'hands' | 'pending' | 'patience' | 'shedding' | 'mahjong'> & {
	mahjong?:MahjongView;
	patience?:PatienceState<VisibleCard>; shedding?:SheddingState<VisibleCard>;
	stockCount: number;
	hands: Record<string, VisibleCard[]>;
	pending?: { card?: VisibleCard };
	totals: Record<string, number>;
};
const RANKS: CardRank[] = [
	'A',
	'2',
	'3',
	'4',
	'5',
	'6',
	'7',
	'8',
	'9',
	'10',
	'J',
	'Q',
	'K',
];
const SUITS: CardSuit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

export function makeDeck(count = 1): TableCard[] {
	return Array.from({length:count},(_,di)=>SUITS.flatMap((suit, si) =>
		RANKS.map((rank, ri) => ({
			id: `card-${di * 52 + si * 13 + ri}`,
			rank,
			suit,
			faceUp: false,
		})),
	)).flat();
}
export function shuffledDeck(count = 1): TableCard[] {
	const deck = makeDeck(count);
	for (let i = deck.length - 1; i > 0; i--) {
		// Rejection sampling avoids modulo bias; identities are independent of card faces.
		const bound = i + 1,
			limit = Math.floor(0x100000000 / bound) * bound;
		let n: number;
		do {
			n = crypto.getRandomValues(new Uint32Array(1))[0];
		} while (n >= limit);
		const j = n % bound;
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
	return deck.map((c) => ({ ...c, id: crypto.randomUUID() }));
}
function rules(bundle: RuntimeRulesetBundle): TableRules {
	const r = bundle.runtimeRulePack.tableRules;
	validateTableRules(r);
	return r;
}
export function createTable(
	players: string[],
	bundle: RuntimeRulesetBundle,
	inventory: (TableCard | Tile)[],
	previous?: TableState,
): TableState {
	const r = rules(bundle);
	if (
		players.length < r.players.min ||
		players.length > r.players.max ||
		new Set(players).size !== players.length
	)
		throw new Error('Invalid player count');
 if(r.tileMahjong)return createMahjongTable(players,inventory as Tile[],r.tileMahjong,previous);
 const deck=inventory as TableCard[];
 const expected=makeDeck(deckCountFor(r,players.length));
 if(deck.length!==expected.length||new Set(deck.map(c=>c.id)).size!==deck.length||expected.some(c=>deck.filter(v=>v.rank===c.rank&&v.suit===c.suit).length!==deckCountFor(r,players.length))) throw new Error('Invalid deck');
	if (previous && previous.stage !== 'round_end')
		throw new Error('Finish this round first');
	const nextDealer = previous
		? Array.from(
				{ length: previous.players.length },
				(_, i) =>
					previous.players[(previous.dealer + i + 1) % previous.players.length],
			).find((id) => players.includes(id))
		: undefined;
	const dealer = nextDealer ? players.indexOf(nextDealer) : 0;
	const stock = structuredClone(deck).map((c) => ({ ...c, faceUp: false }));
	const hands: TableState['hands'] = Object.fromEntries(
		players.map((p) => [p, []]),
	);
 if(r.patience||r.shedding||r.contract)return createAdditional({players:[...players],round:(previous?.round??0)+1,dealer,turn:(dealer+1)%players.length,stage:'play',hands,stock,discard:[],melds:[],scores:structuredClone(previous?.scores??[]),winners:[]},r,previous);
	const count = r.deal.byPlayerCount?.[players.length] ?? r.deal.cardsPerPlayer;
	for (let i = 0; i < count; i++)
		for (let seat = 1; seat <= players.length; seat++)
			hands[players[(dealer + seat) % players.length]].push(stock.pop()!);
	const first = stock.pop()!;
	first.faceUp = true;
	return {
		...(r.layout ? { layout: { ...r.layout } } : {}),
		players: [...players],
		round: (previous?.round ?? 0) + 1,
		dealer,
		turn: (dealer + 1) % players.length,
		stage: r.layout && r.layout.initialReveals > 0 ? 'setup' : 'draw',
		hands,
		stock,
		discard: [first],
		melds: [],
		scores: structuredClone(previous?.scores ?? []),
		winners: [],
	};
}
export function scoreTableRound(
	s: TableState,
	b: RuntimeRulesetBundle,
): Record<string, number> {
	const r = rules(b);
	const pack = (b.runtimeRulePack.scoreRulePack ??
		createRulePack()) as RulePack;
	return Object.fromEntries(
		s.players.map((p) => [
			p,
			r.scoring.zones.reduce((sum, z) => {
				const cards =
					z.zone === 'hand'
						? s.hands[p]
						: s.melds.flatMap((m) => m.cards.filter((c) => c.ownerId === p));
				const points = scoreCardCollection(
					cards,
					pack,
					z.zone === 'hand' ? r.scoring.columnPairs : undefined,
				);
				return sum + points * z.multiplier;
			}, 0),
		]),
	);
}
export function tableTotals(
	s: Pick<TableState, 'players' | 'scores'>,
): Record<string, number> {
	return Object.fromEntries(
		s.players.map((p) => [
			p,
			s.scores.reduce((n, round) => n + (round[p] ?? 0), 0),
		]),
	);
}
function endRound(s: TableState, b: RuntimeRulesetBundle): void {
	s.stage = 'round_end';
	s.pending = undefined;
	for (const cards of Object.values(s.hands))
		cards.forEach((c) => (c.faceUp = true));
	s.scores.push(scoreTableRound(s, b));
	const r = rules(b),
		totals = tableTotals(s);
	if (
		(r.scoring.rounds && s.round >= r.scoring.rounds) ||
		(r.scoring.target &&
			Object.values(totals).some((n) => n >= r.scoring.target!))
	) {
		s.stage = 'game_end';
		const best = (r.scoring.lowWins ? Math.min : Math.max)(
			...Object.values(totals),
		);
		s.winners = s.players.filter((p) => totals[p] === best);
	}
}
function finishTurn(s: TableState, b: RuntimeRulesetBundle): void {
	const r = rules(b);
	if (
		(r.roundEnd === 'all_revealed' &&
			s.players.some((p) => s.hands[p].every((c) => c.faceUp))) ||
		(r.roundEnd === 'empty_hand' &&
			s.players.some((p) => s.hands[p].length === 0)) ||
		s.stock.length === 0
	) {
		endRound(s, b);
		return;
	}
	s.pending = undefined;
	s.turn = (s.turn + 1) % s.players.length;
	s.stage = 'draw';
}
function takeCards(hand: TableCard[], ids: string[]): TableCard[] {
	if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length)
		throw new Error('Choose distinct cards');
	return ids.map((id) => {
		const c = hand.find((c) => c.id === id);
		if (!c) throw new Error('Card is not in your hand');
		return c;
	});
}
function lay(
	s: TableState,
	actor: string,
	ids: string[],
	b: RuntimeRulesetBundle,
	meldId?: string,
): void {
	const r = rules(b);
	if (!r.meld) throw new Error('Melding is not available');
	const cards = takeCards(s.hands[actor], ids);
	const target = meldId ? s.melds.find((m) => m.id === meldId) : undefined;
	if (meldId && !target) throw new Error('Meld not found');
	if (!validMeld([...(target?.cards ?? []), ...cards], r.meld))
		throw new Error('Choose a valid meld: matching ranks or a suited run');
	const owned = cards.map((c) => ({ ...c, faceUp: true, ownerId: actor }));
	if (target) target.cards.push(...owned);
	else s.melds.push({ id: `meld-${s.round}-${s.melds.length}`, cards: owned });
	s.hands[actor] = s.hands[actor].filter((c) => !ids.includes(c.id));
	if (!s.hands[actor].length) endRound(s, b);
}
/** Validate and apply to a clone so compound pickup/swap failures are atomic. */
export function applyTableCommand(
	state: TableState,
	actor: string,
	command: TableCommand,
	b: RuntimeRulesetBundle,
): TableState {
	const r = rules(b),
		s = structuredClone(state);
	if (!s.players.includes(actor)) throw new Error('Unknown player');
	if(r.tileMahjong)return applyMahjong(s,actor,command as TileCommand,r.tileMahjong);
	if(r.patience||r.shedding||r.contract)return applyAdditional(s,actor,command,r);
	if (command.type === 'reveal') {
		if (s.stage !== 'setup' || !r.layout)
			throw new Error('Initial reveal is finished');
		const hand = s.hands[actor],
			card = hand[command.slot];
		if (
			!Number.isInteger(command.slot) ||
			!card ||
			card.faceUp ||
			hand.filter((c) => c.faceUp).length >= r.layout.initialReveals
		)
			throw new Error('Choose an unrevealed position');
		card.faceUp = true;
		if (
			s.players.every(
				(p) =>
					s.hands[p].filter((c) => c.faceUp).length ===
					r.layout!.initialReveals,
			)
		)
			s.stage = 'draw';
		return s;
	}
	if (!['draw', 'play'].includes(s.stage))
		throw new Error('This round is not accepting turns');
	if (s.players[s.turn] !== actor) throw new Error('Wait for your turn');
	if (command.type === 'draw') {
		if (s.stage !== 'draw') throw new Error('Already drew this turn');
		if (!['stock', 'discard'].includes(command.source))
			throw new Error('Invalid draw source');
		const pile = s[command.source];
		if (!pile.length) throw new Error('Pile is empty');
		let index = pile.length - 1;
		if (command.source === 'discard' && command.cardId)
			index = pile.findIndex((c) => c.id === command.cardId);
		if (
			index < 0 ||
			(command.source === 'discard' &&
				r.discard.pickup === 'top' &&
				index !== pile.length - 1)
		)
			throw new Error('Choose the top discard');
		const picked = pile.splice(index);
		s.stage = 'play';
		if (r.layout) {
			s.pending = { card: picked[0] };
		} else {
			s.hands[actor].push(...picked.map((c) => ({ ...c, faceUp: false })));
			if (command.source === 'discard' && r.discard.immediateUse) {
				if (!command.meldCardIds?.includes(picked[0].id))
					throw new Error(
						'Use the picked card immediately in a meld or layoff',
					);
				lay(s, actor, command.meldCardIds, b, command.meldId);
			}
		}
		return s;
	}
	if (s.stage !== 'play') throw new Error('Draw a card first');
	if (command.type === 'swap') {
		const old = s.hands[actor][command.slot];
		if (
			!r.layout ||
			!s.pending?.card ||
			!Number.isInteger(command.slot) ||
			!old
		)
			throw new Error('Choose a layout position');
		s.hands[actor][command.slot] = { ...s.pending.card, faceUp: true };
		s.discard.push({ ...old, faceUp: true });
		finishTurn(s, b);
	} else if (command.type === 'discard') {
		let card: TableCard;
		if (r.layout) {
			if (!s.pending?.card) throw new Error('No drawn card');
			card = s.pending.card;
		} else {
			card = takeCards(s.hands[actor], [command.cardId!])[0];
			s.hands[actor] = s.hands[actor].filter((c) => c.id !== card.id);
		}
		s.discard.push({ ...card, faceUp: true });
		finishTurn(s, b);
	} else if (command.type === 'meld' || command.type === 'layoff')
		lay(
			s,
			actor,
			command.cardIds,
			b,
			command.type === 'layoff' ? command.meldId : undefined,
		);
	else throw new Error('Unknown table command');
	return s;
}
/** Allowlisted projection: never serialize the authoritative deck or event log. */
export function projectTable(s: TableState, viewer: string): TableView {
	const ended = s.stage === 'round_end' || s.stage === 'game_end';
	const visible = (c: TableCard, show: boolean, id = c.id): VisibleCard =>
		show ? { ...c } : { id, faceUp: false };
	return {
		...projectAdditional(s),
		...(s.mahjong?{mahjong:projectMahjong(s,viewer,s.mahjong.policy)}:{}),
		...(s.layout ? { layout: { ...s.layout } } : {}),
		players: [...s.players],
		round: s.round,
		dealer: s.dealer,
		turn: s.turn,
		stage: s.stage,
		hands: Object.fromEntries(
			s.players.map((p) => [
				p,
				s.hands[p].map((c, i) =>
					visible(
						c,
						ended || c.faceUp || (p === viewer && !s.layout) || (s.contract?.dummyVisible && p === s.contract.dummy) === true,
						`hidden-${p}-${i}`,
					),
				),
			]),
		),
		stockCount: s.stock.length,
		discard: structuredClone(s.discard),
		melds: structuredClone(s.melds),
		...(s.pending
			? {
					pending: {
						...(s.pending.card
							? {
									card: visible(
										s.pending.card,
										s.players[s.turn] === viewer,
										'drawn-card',
									),
								}
							: {}),
					},
				}
			: {}),
		scores: structuredClone(s.scores),
		totals: tableTotals(s),
		winners: [...s.winners],
	};
}
