import type { TableCard, VisibleCard } from './table-engine';
import { validMeld } from './meld-rules';
import type { TableRules } from './table-rules';
export type HandOrder = 'dealt' | 'rank' | 'suit' | 'manual';
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
function known(card: VisibleCard): card is TableCard {
	return Boolean(card.rank && card.suit);
}
export function reconcileHandOrder(cards: VisibleCard[], previous: string[]): string[] {
	const current = new Set(cards.map((c) => c.id));
	return [...new Set([...previous.filter((id) => current.has(id)), ...current])];
}
export function moveHandCard(ids: string[], id: string, destination: number): string[] {
	if (
		!ids.includes(id) ||
		!Number.isInteger(destination) ||
		destination < 0 ||
		destination >= ids.length
	)
		return [...ids];
	const next = ids.filter((value) => value !== id);
	next.splice(destination, 0, id);
	return next;
}
export function sortHand(
	cards: VisibleCard[],
	order: HandOrder,
	manual: string[] = []
): VisibleCard[] {
	const copy = [...cards];
	if (order === 'manual') {
		const positions = new Map(reconcileHandOrder(cards, manual).map((id, index) => [id, index]));
		return copy.sort((a, b) => positions.get(a.id)! - positions.get(b.id)!);
	}
	if (order === 'dealt') return copy;
	return copy.sort((a, b) => {
		const rank = ranks.indexOf(a.rank ?? '') - ranks.indexOf(b.rank ?? '');
		const suit = suits.indexOf(a.suit ?? '') - suits.indexOf(b.suit ?? '');
		return order === 'rank' ? rank || suit : suit || rank;
	});
}
export function layoffBlockReason(input: {
	stage: string;
	myTurn: boolean;
	arranging: boolean;
	pickup: boolean;
	selected: VisibleCard[];
	meld: VisibleCard[];
	policy: NonNullable<TableRules['meld']>;
}): string {
	if (input.stage === 'round_end' || input.stage === 'game_end') return 'This round has ended.';
	if (!input.myTurn) return 'Wait for your turn, then draw before laying off.';
	if (input.arranging) return 'Finish arranging your hand before selecting cards to play.';
	if (input.stage !== 'play' && !(input.stage === 'draw' && input.pickup))
		return 'Draw from stock or choose a discard first.';
	if (!input.selected.length) return 'Select cards from your hand to add to this meld.';
	if (!canMeldCards([...input.meld, ...input.selected], input.policy))
		return 'Selected cards do not extend this meld. Match its rank or continue its suited run.';
	return '';
}
export function canMeldCards(
	cards: VisibleCard[],
	policy: NonNullable<TableRules['meld']>
): boolean {
	return cards.every(known) && validMeld(cards, policy);
}
export function findMeld(
	cards: VisibleCard[],
	policy: NonNullable<TableRules['meld']>,
	anchor?: string
): string[] | undefined {
	const accept = (group: VisibleCard[]) =>
		(!anchor || group.some((c) => c.id === anchor)) && canMeldCards(group, policy);
	for (const rank of ranks) {
		const group = cards.filter((c) => c.rank === rank);
		if (accept(group)) return group.map((c) => c.id);
	}
	for (const suit of suits) {
		const order = policy.ace === 'both' ? [...ranks, 'A'] : ranks;
		for (let start = 0; start < order.length - 2; start++) {
			const run: VisibleCard[] = [];
			for (let i = start; i < order.length; i++) {
				const card = cards.find((c) => c.suit === suit && c.rank === order[i]);
				if (!card) break;
				run.push(card);
				if (accept(run)) return run.map((c) => c.id);
			}
		}
	}
}
