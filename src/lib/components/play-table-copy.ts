import type { PlayCardView } from '$lib/gameplay/play-surface-model';

export function cardLabelForAction(card: Pick<PlayCardView, 'isFaceDown' | 'label'>): string {
	return card.isFaceDown ? 'hidden card' : card.label;
}
