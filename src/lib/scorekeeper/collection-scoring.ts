import { cardValue, type CardInput, type RulePack } from './engine';

/** Sum one ordered zone, optionally cancelling equal two-row column pairs. */
export function scoreCardCollection(
	cards: CardInput[],
	rules: RulePack,
	columnPairs?: number
): number {
	let total = cards.reduce((sum, card) => sum + cardValue(card, rules), 0);
	if (columnPairs) {
		for (let column = 0; column < columnPairs; column++) {
			const top = cards[column];
			const bottom = cards[column + columnPairs];
			if (top && bottom && top.rank === bottom.rank) {
				total -= cardValue(top, rules) + cardValue(bottom, rules);
			}
		}
	}
	return total;
}
