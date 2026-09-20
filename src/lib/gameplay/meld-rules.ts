import type { TableCard } from './table-engine';
import type { TableRules } from './table-rules';
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function validMeld(cards: TableCard[], policy: NonNullable<TableRules['meld']>): boolean {
	if (new Set(cards.map((c) => `${c.rank}-${c.suit}`)).size !== cards.length) return false;
	if (
		cards.length >= policy.minSet &&
		cards.length <= policy.maxSet &&
		cards.every((c) => c.rank === cards[0].rank)
	)
		return true;
	if (cards.length < policy.minRun || !cards.every((c) => c.suit === cards[0].suit)) return false;
	return [false, ...(policy.ace === 'both' ? [true] : [])].some((high) => {
		const values = cards
			.map((c) => (c.rank === 'A' && high ? 14 : RANKS.indexOf(c.rank) + 1))
			.sort((a, b) => a - b);
		return values.every((n, i) => i === 0 || n === values[i - 1] + 1);
	});
}
