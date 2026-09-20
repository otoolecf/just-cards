import type {
	TableCard,
	TableState,
	TableCommand,
	VisibleCard,
} from './table-engine';
import type { TableRules } from './table-rules';
import {
	emptyRubber,
	scoreContract,
	type Strain,
	type RubberState,
} from './contract-scoring';
export interface PileRef {
	zone: 'tableau' | 'foundation' | 'waste';
	index: number;
}
export type AdditionalCommand =
	| { type: 'patience_draw' }
	| { type: 'patience_concede' }
	| { type: 'patience_move'; from: PileRef; to: PileRef; cardId: string }
	| { type: 'shedding_setup'; cardIds: string[] }
	| { type: 'shedding_play'; cardIds: string[] }
	| { type: 'shedding_blind'; slot: number }
	| { type: 'shedding_pickup' }
	| {
			type: 'contract_call';
			call: 'pass' | 'bid' | 'double' | 'redouble';
			level?: number;
			strain?: Strain;
	  }
	| { type: 'trick_play'; cardId: string };
export interface PatienceState<C = TableCard> {
	tableau: C[][];
	foundations: C[][];
}
export interface SheddingState<C = TableCard> {
	up: Record<string, C[]>;
	down: Record<string, C[]>;
	ready: string[];
	burned: TableCard[];
	message: string;
}
export interface ContractCall {
	player: string;
	call: 'pass' | 'bid' | 'double' | 'redouble';
	level?: number;
	strain?: Strain;
}
export interface ContractState {
	phase: 'auction' | 'tricks' | 'complete';
	calls: ContractCall[];
	bid?: { player: string; level: number; strain: Strain; doubling: 1 | 2 | 4 };
	declarer?: string;
	dummy?: string;
	dummyVisible: boolean;
	trick: { player: string; card: TableCard }[];
	lastTrick: { player: string; card: TableCard }[];
	played: TableCard[];
	tricks: [number, number];
	rubber: RubberState;
	honors: [number, number];
	result?: string;
}
const ranks = [
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
const rank = (c: TableCard) =>
	c.rank === 'A' ? 14 : ranks.indexOf(c.rank) + 1;
const red = (c: TableCard) => c.suit === 'diamonds' || c.suit === 'hearts';
const selected = (cards: TableCard[], ids: string[]) => {
	if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length)
		throw new Error('Choose distinct cards');
	return ids.map((id) => {
		const c = cards.find((c) => c.id === id);
		if (!c) throw new Error('Choose cards from the active hand or pile');
		return c;
	});
};
export function createAdditional(
	s: TableState,
	r: TableRules,
	previous?: TableState,
): TableState {
	const deal = (count: number) => {
		for (let i = 0; i < count; i++)
			for (let seat = 1; seat <= s.players.length; seat++)
				s.hands[s.players[(s.dealer + seat) % s.players.length]].push(
					s.stock.pop()!,
				);
	};
	if (r.patience) {
		s.turn = 0;
		s.stage = 'play';
		s.patience = {
			tableau: Array.from({ length: 7 }, () => []),
			foundations: Array.from({ length: 4 }, () => []),
		};
		for (let row = 0; row < 7; row++)
			for (let col = row; col < 7; col++)
				s.patience.tableau[col].push({
					...s.stock.pop()!,
					faceUp: row === col,
				});
	} else if (r.shedding) {
		deal(3);
		s.shedding = {
			down: structuredClone(s.hands),
			up: Object.fromEntries(s.players.map((p) => [p, []])),
			ready: [],
			burned: [],
			message: 'Choose three cards to place face up.',
		};
		s.hands = Object.fromEntries(s.players.map((p) => [p, []]));
		deal(6);
		s.stage = 'setup';
	} else if (r.contract) {
		if (
			previous &&
			JSON.stringify(previous.players) !== JSON.stringify(s.players)
		)
			throw new Error('Keep the same partnership seats throughout a rubber');
		deal(13);
		s.turn = s.dealer;
		s.stage = 'play';
		s.contract = {
			phase: 'auction',
			calls: [],
			dummyVisible: false,
			trick: [],
			lastTrick: [],
			played: [],
			tricks: [0, 0],
			rubber: structuredClone(previous?.contract?.rubber ?? emptyRubber()),
			honors: [0, 0],
		};
	}
	return s;
}
function outcome(s: TableState, winner?: string) {
	s.stage = 'game_end';
	s.winners = winner ? [winner] : [];
	s.scores.push(
		Object.fromEntries(s.players.map((p) => [p, p === winner ? 1 : 0])),
	);
}
function patience(s: TableState, c: AdditionalCommand) {
	const p = s.patience!;
	if (c.type === 'patience_concede') {
		outcome(s);
		return;
	}
	if (c.type === 'patience_draw') {
		if (s.stock.length) s.discard.push({ ...s.stock.pop()!, faceUp: true });
		else if (s.discard.length) {
			s.stock = s.discard.reverse().map((c) => ({ ...c, faceUp: false }));
			s.discard = [];
		} else throw new Error('No stock or waste to draw');
		return;
	}
	if (c.type !== 'patience_move') throw new Error('Choose a solitaire move');
	const pile = (ref: PileRef) => {
		if (!ref || !Number.isInteger(ref.index)) throw new Error('Invalid pile');
		const result =
			ref.zone === 'tableau'
				? p.tableau[ref.index]
				: ref.zone === 'foundation'
					? p.foundations[ref.index]
					: ref.zone === 'waste' && ref.index === 0
						? s.discard
						: undefined;
		if (!result) throw new Error('Invalid pile');
		return result;
	};
	const from = pile(c.from),
		to = pile(c.to),
		i = from.findIndex((v) => v.id === c.cardId);
	if (from === to || i < 0 || !from[i].faceUp || c.to.zone === 'waste')
		throw new Error('Choose a visible card and a different destination');
	const moving = from.slice(i),
		first = moving[0],
		top = to.at(-1);
	if (c.from.zone !== 'tableau' && moving.length !== 1)
		throw new Error('Only the top card can move from this pile');
	for (let j = 1; j < moving.length; j++)
		if (
			!moving[j].faceUp ||
			red(moving[j]) === red(moving[j - 1]) ||
			ranks.indexOf(moving[j].rank) !== ranks.indexOf(moving[j - 1].rank) - 1
		)
			throw new Error('Move an alternating descending sequence');
	if (c.to.zone === 'foundation') {
		if (
			moving.length !== 1 ||
			(!top
				? first.rank !== 'A'
				: first.suit !== top.suit ||
					ranks.indexOf(first.rank) !== ranks.indexOf(top.rank) + 1)
		)
			throw new Error('Foundations build A to K in one suit');
	} else if (
		!top
			? first.rank !== 'K'
			: red(first) === red(top) ||
				ranks.indexOf(first.rank) !== ranks.indexOf(top.rank) - 1
	)
		throw new Error(
			'Tableau builds downward in alternating colors; empty columns need a King',
		);
	to.push(...from.splice(i));
	if (from.length) from[from.length - 1].faceUp = true;
	if (p.foundations.every((f) => f.length === 13)) outcome(s, s.players[0]);
}
export function canShed(
	card: Pick<TableCard, 'rank'>,
	top: Pick<TableCard, 'rank'> | undefined,
	r: NonNullable<TableRules['shedding']>,
): boolean {
	if (
		!top ||
		(r.resetTwo && (card.rank === '2' || top.rank === '2')) ||
		(r.burnTen && card.rank === '10')
	)
		return true;
	const n = (v: Pick<TableCard, 'rank'>) =>
		v.rank === 'A' ? 14 : ranks.indexOf(v.rank) + 1;
	return r.lowSeven && top.rank === '7' ? n(card) <= 7 : n(card) >= n(top);
}
function shedding(
	s: TableState,
	actor: string,
	c: AdditionalCommand,
	r: NonNullable<TableRules['shedding']>,
) {
	const p = s.shedding!,
		next = () => {
			s.turn = (s.turn + 1) % s.players.length;
		},
		hand = s.hands[actor];
	if (c.type === 'shedding_setup') {
		if (
			s.stage !== 'setup' ||
			p.ready.includes(actor) ||
			c.cardIds?.length !== 3
		)
			throw new Error('Choose exactly three face-up cards');
		p.up[actor] = selected(hand, c.cardIds).map((c) => ({
			...c,
			faceUp: true,
		}));
		s.hands[actor] = hand.filter((v) => !c.cardIds.includes(v.id));
		p.ready.push(actor);
		if (p.ready.length === s.players.length) {
			s.stage = 'play';
			s.discard.push({ ...s.stock.pop()!, faceUp: true });
			p.message = 'Play equal or higher, or a special card.';
		}
		return;
	}
	if (s.stage !== 'play' || s.players[s.turn] !== actor)
		throw new Error('Wait for your turn');
	const active = hand.length
		? hand
		: p.up[actor].length
			? p.up[actor]
			: p.down[actor];
	const blind = active === p.down[actor],
		top = s.discard.at(-1);
	const pickup = () => {
		hand.push(...s.discard.splice(0).map((c) => ({ ...c, faceUp: false })));
		next();
		p.message = 'Pile picked up; turn passes.';
	};
	if (c.type === 'shedding_pickup') {
		if (blind || active.some((v) => canShed(v, top, r)))
			throw new Error('Play a legal card, or reveal a blind card');
		if (!s.discard.length) throw new Error('Pile is empty');
		pickup();
		return;
	}
	let cards: TableCard[];
	if (c.type === 'shedding_blind') {
		if (!blind || !Number.isInteger(c.slot) || !active[c.slot])
			throw new Error(
				'Choose a blind position only after hand and face-up cards are gone',
			);
		cards = active.splice(c.slot, 1);
		if (!canShed(cards[0], top, r)) {
			s.discard.push({ ...cards[0], faceUp: true });
			pickup();
			return;
		}
	} else if (c.type === 'shedding_play') {
		if (blind) throw new Error('Reveal one blind card');
		cards = selected(active, c.cardIds);
		if (
			cards.some((v) => v.rank !== cards[0].rank) ||
			!canShed(cards[0], top, r)
		)
			throw new Error('Play matching ranks that satisfy the pile restriction');
		const ids = new Set(cards.map((v) => v.id));
		active.splice(0, active.length, ...active.filter((v) => !ids.has(v.id)));
	} else throw new Error('Choose a shedding move');
	s.discard.push(...cards.map((c) => ({ ...c, faceUp: true })));
	while (hand.length < r.refill && s.stock.length) hand.push(s.stock.pop()!);
	const ten = r.burnTen && cards[0].rank === '10',
		four =
			r.fourBurn &&
			s.discard.length >= 4 &&
			s.discard.slice(-4).every((v) => v.rank === cards[0].rank);
	if (ten || four) {
		p.burned.push(...s.discard.splice(0));
		p.message = ten
			? 'Ten clears the pile. Play again.'
			: 'Four matching cards clear the pile. Next player starts.';
		if (!ten) next();
	} else if (r.forcePickupThree && cards[0].rank === '3') {
		next();
		s.hands[s.players[s.turn]].push(
			...s.discard.splice(0).map((v) => ({ ...v, faceUp: false })),
		);
		next();
		p.message = 'Three: next player picks up the pile and loses their turn.';
	} else {
		next();
		p.message =
			r.lowSeven && cards[0].rank === '7'
				? 'Seven: next play must be 7 or lower. Enabled wild cards still apply.'
				: 'Play equal or higher, or a special card.';
	}
	if (!hand.length && !p.up[actor].length && !p.down[actor].length)
		outcome(s, actor);
}
const strains: Strain[] = ['clubs', 'diamonds', 'hearts', 'spades', 'notrump'];
function contract(
	s: TableState,
	actor: string,
	c: AdditionalCommand,
	r: NonNullable<TableRules['contract']>,
) {
	const p = s.contract!,
		team = (id: string) => (s.players.indexOf(id) % 2) as 0 | 1;
	if (c.type === 'contract_call') {
		if (p.phase !== 'auction' || s.players[s.turn] !== actor)
			throw new Error('Wait for your auction turn');
		if (c.call === 'bid') {
			if (
				!Number.isInteger(c.level) ||
				c.level! < 1 ||
				c.level! > 7 ||
				!strains.includes(c.strain!)
			)
				throw new Error('Choose a level and strain');
			if (
				p.bid &&
				c.level! * 5 + strains.indexOf(c.strain!) <=
					p.bid.level * 5 + strains.indexOf(p.bid.strain)
			)
				throw new Error('Bid must exceed the current contract');
			p.bid = {
				player: actor,
				level: c.level!,
				strain: c.strain!,
				doubling: 1,
			};
		} else if (c.call === 'double') {
			if (!p.bid || team(p.bid.player) === team(actor) || p.bid.doubling !== 1)
				throw new Error('Only opponents may double an undoubled contract');
			p.bid.doubling = 2;
		} else if (c.call === 'redouble') {
			if (!p.bid || team(p.bid.player) !== team(actor) || p.bid.doubling !== 2)
				throw new Error('Only the declaring side may redouble');
			p.bid.doubling = 4;
		} else if (c.call !== 'pass') throw new Error('Invalid call');
		p.calls.push({
			player: actor,
			call: c.call,
			...(c.call === 'bid' ? { level: c.level, strain: c.strain } : {}),
		});
		s.turn = (s.turn + 1) % 4;
		const passes = p.calls.slice(-(p.bid ? 3 : 4));
		if (
			passes.length === (p.bid ? 3 : 4) &&
			passes.every((c) => c.call === 'pass')
		) {
			if (!p.bid) {
				p.phase = 'complete';
				p.result = 'Passed out — deal again.';
				s.stage = 'round_end';
				s.scores.push(Object.fromEntries(s.players.map((id) => [id, 0])));
				return;
			}
			p.declarer = p.calls.find(
				(c) =>
					c.call === 'bid' &&
					c.strain === p.bid!.strain &&
					team(c.player) === team(p.bid!.player),
			)!.player;
			p.dummy = s.players[(s.players.indexOf(p.declarer) + 2) % 4];
			p.phase = 'tricks';
			s.turn = (s.players.indexOf(p.declarer) + 1) % 4;
			if (r.honors)
				for (const id of s.players) {
					const count = s.hands[id].filter((v) =>
						p.bid!.strain === 'notrump'
							? v.rank === 'A'
							: v.suit === p.bid!.strain &&
								['A', 'K', 'Q', 'J', '10'].includes(v.rank),
					).length;
					p.honors[team(id)] = Math.max(
						p.honors[team(id)],
						count === 5
							? 150
							: count === 4
								? p.bid.strain === 'notrump'
									? 150
									: 100
								: 0,
					);
				}
		}
		return;
	}
	if (c.type !== 'trick_play' || p.phase !== 'tricks')
		throw new Error('Complete the auction first');
	const seat = s.players[s.turn],
		controller = seat === p.dummy ? p.declarer : seat;
	if (actor !== controller)
		throw new Error(
			seat === p.dummy ? 'Declarer plays the dummy hand' : 'Wait for your turn',
		);
	const hand = s.hands[seat],
		card = selected(hand, [c.cardId])[0],
		lead = p.trick[0]?.card;
	if (lead && card.suit !== lead.suit && hand.some((v) => v.suit === lead.suit))
		throw new Error('Follow the led suit when you can');
	s.hands[seat] = hand.filter((v) => v.id !== card.id);
	p.trick.push({ player: seat, card: { ...card, faceUp: true } });
	p.dummyVisible = true;
	if (p.trick.length === 4) {
		const trump = p.bid!.strain;
		let winner = p.trick[0];
		for (const play of p.trick.slice(1))
			if (
				(play.card.suit === winner.card.suit &&
					rank(play.card) > rank(winner.card)) ||
				(play.card.suit === trump && winner.card.suit !== trump)
			)
				winner = play;
		p.tricks[team(winner.player)]++;
		s.turn = s.players.indexOf(winner.player);
		p.lastTrick = p.trick;
		p.played.push(...p.trick.map((v) => v.card));
		p.trick = [];
		if (p.played.length === 52) {
			const result = scoreContract(p.rubber, {
				...p.bid!,
				team: team(p.declarer!),
				tricks: p.tricks[team(p.declarer!)],
				honors: p.honors,
			});
			p.rubber = result.state;
			p.result = result.description;
			p.phase = 'complete';
			s.scores.push(
				Object.fromEntries(s.players.map((id) => [id, result.delta[team(id)]])),
			);
			s.stage = result.state.finished ? 'game_end' : 'round_end';
			if (result.state.finished)
				s.winners = s.players.filter(
					(id) =>
						result.state.totals[team(id)] === Math.max(...result.state.totals),
				);
		}
	} else s.turn = (s.turn + 1) % 4;
}
export function applyAdditional(
	s: TableState,
	actor: string,
	c: TableCommand,
	r: TableRules,
): TableState {
	if (['round_end', 'game_end'].includes(s.stage))
		throw new Error('This round has finished');
	if (r.patience) {
		if (s.players[s.turn] !== actor) throw new Error('Wait for your turn');
		patience(s, c as AdditionalCommand);
	} else if (r.shedding) shedding(s, actor, c as AdditionalCommand, r.shedding);
	else if (r.contract) contract(s, actor, c as AdditionalCommand, r.contract);
	return s;
}
export function projectAdditional(s: TableState) {
	const mask = (cards: TableCard[], prefix: string): VisibleCard[] =>
		cards.map((c, i) =>
			c.faceUp ? { ...c } : { id: `hidden-${prefix}-${i}`, faceUp: false },
		);
	return {
		...(s.patience
			? {
					patience: {
						tableau: s.patience.tableau.map((p, i) => mask(p, `tableau-${i}`)),
						foundations: structuredClone(s.patience.foundations),
					},
				}
			: {}),
		...(s.shedding
			? {
					shedding: {
						...structuredClone(s.shedding),
						down: Object.fromEntries(
							s.players.map((id) => [
								id,
								mask(s.shedding!.down[id], `down-${id}`),
							]),
						),
					},
				}
			: {}),
		// Honors reveal properties of still-private hands; expose only once the hand is complete.
		...(s.contract
			? {
					contract: {
						...structuredClone(s.contract),
						honors:
							s.contract.phase === 'complete'
								? s.contract.honors
								: ([0, 0] as [number, number]),
					},
				}
			: {}),
	};
}
