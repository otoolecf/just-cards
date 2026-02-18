import { describe, expect, it } from 'vitest';

import type { PlayCardView } from '$lib/gameplay/play-surface-model';
import { cardLabelForAction } from './play-table-copy';

const BASE_CARD: PlayCardView = {
	key: 'card-1',
	rank: 'A',
	suit: 'spades',
	label: 'A♠',
	suitTone: 'dark',
	isFaceDown: false
};

describe('play table copy helpers', () => {
	it('play_table_copy_hidden_cards_use_human_label', () => {
		expect(cardLabelForAction({ ...BASE_CARD, isFaceDown: true, label: '??' })).toBe('hidden card');
	});

	it('play_table_copy_visible_cards_use_card_label', () => {
		expect(cardLabelForAction(BASE_CARD)).toBe('A♠');
	});
});
