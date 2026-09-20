import { expect, it } from 'vitest';
import { canMeldCards, findMeld, sortHand } from './table-presentation';
import type { VisibleCard } from './table-engine';
const policy = { minSet:3, maxSet:4, minRun:3, ace:'both' as const };
const cards = (ranks: string[], suit = 'hearts') => ranks.map(rank => ({id:rank+suit, rank, suit, faceUp:false})) as VisibleCard[];
it('finds legal pickup combinations using the anchor and avoids wrapped aces', () => {
	const hand = cards(['K','A','2','3','Q']);
	expect(canMeldCards(cards(['K','A','2']), policy)).toBe(false);
	const found = findMeld(hand, policy, 'Ahearts');
	expect(found).toContain('Ahearts');
	expect(canMeldCards(hand.filter(c => found?.includes(c.id)), policy)).toBe(true);
	expect(findMeld(cards(['2','3','4','9']), policy, '9hearts')).toBeUndefined();
	expect(canMeldCards([{id:'hidden',faceUp:false}, ...cards(['2','3'])], policy)).toBe(false);
});
it('sorts a private hand without mutating server positions or losing card identity', () => {
	const hand = [...cards(['K','3']), ...cards(['A','2'],'clubs')];
	const original = structuredClone(hand);
	expect(sortHand(hand, 'rank').map(c => c.rank)).toEqual(['A','2','3','K']);
	expect(sortHand(hand, 'suit').map(c => c.suit)).toEqual(['clubs','clubs','hearts','hearts']);
	expect(hand).toEqual(original);
	expect(sortHand(hand, 'dealt')).toEqual(original);
});
