import { expect, it } from 'vitest';
import {
	reconcileHandOrder,
	moveHandCard,
	sortHand,
	layoffBlockReason
} from './table-presentation';
import type { VisibleCard } from './table-engine';

const hand: VisibleCard[] = ['A', '2', '3', '4'].map((rank) => ({
	id: rank,
	rank: rank as 'A',
	suit: 'diamonds',
	faceUp: false
}));
const policy = { minSet: 3, maxSet: 4, minRun: 3, ace: 'both' as const };
it('moves cards to either end without mutating or duplicating card identities', () => {
	const ids = hand.map((c) => c.id);
	expect(moveHandCard(ids, 'A', 3)).toEqual(['2', '3', '4', 'A']);
	expect(moveHandCard(ids, '4', 0)).toEqual(['4', 'A', '2', '3']);
	expect(moveHandCard(ids, 'missing', 0)).toEqual(ids);
	expect(moveHandCard(ids, 'A', -1)).toEqual(ids);
	expect(ids).toEqual(['A', '2', '3', '4']);
});
it('reconciles played and drawn cards while retaining manual order', () => {
	expect(reconcileHandOrder(hand, ['3', 'A', 'gone', '3'])).toEqual(['3', 'A', '2', '4']);
	expect(sortHand(hand, 'manual', ['3', 'A', '2', '4']).map((c) => c.id)).toEqual([
		'3',
		'A',
		'2',
		'4'
	]);
	expect(hand.map((c) => c.id)).toEqual(['A', '2', '3', '4']);
});
it('explains layoff prerequisites and accepts ace-high extension only with the correct suit', () => {
	const meld = ['J', 'Q', 'K'].map((rank) => ({
		id: rank,
		rank: rank as 'J',
		suit: 'diamonds' as const,
		faceUp: true
	}));
	const input = {
		stage: 'play' as const,
		myTurn: true,
		arranging: false,
		pickup: false,
		selected: [hand[0]],
		meld,
		policy
	};
	expect(layoffBlockReason(input)).toBe('');
	expect(layoffBlockReason({ ...input, myTurn: false })).toMatch(/your turn/i);
	expect(layoffBlockReason({ ...input, stage: 'draw' })).toMatch(/draw/i);
	expect(layoffBlockReason({ ...input, arranging: true })).toMatch(/arranging/i);
	expect(layoffBlockReason({ ...input, selected: [] })).toMatch(/select/i);
	expect(layoffBlockReason({ ...input, selected: [{ ...hand[0], suit: 'clubs' }] })).toMatch(
		/extend/i
	);
	expect(layoffBlockReason({ ...input, stage: 'draw', pickup: true })).toBe('');
	expect(layoffBlockReason({ ...input, stage: 'round_end' })).toMatch(/ended/i);
});
