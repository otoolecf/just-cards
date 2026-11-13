import type { CardInput, ScoreEvent } from '$lib/scorekeeper/engine';

export function appliedScoreEvents(events: ScoreEvent[]): ScoreEvent[] {
	const applied: ScoreEvent[] = [], undone: ScoreEvent[] = [];
	for (const event of events) {
		if (event.type === 'undo') { const last = applied.pop(); if (last) undone.push(last); }
		else if (event.type === 'redo') { const last = undone.pop(); if (last) applied.push(last); }
		else { applied.push(event); undone.length = 0; }
	}
	return applied;
}
export function latestAppliedScore(events: ScoreEvent[]): ScoreEvent | undefined {
	return appliedScoreEvents(events).at(-1);
}
const suits: Record<string,string> = {hearts:'H',diamonds:'D',clubs:'C',spades:'S'};
const cardText = (cards:CardInput[]) => cards.map(c=>`${c.rank}${c.suit ? suits[c.suit] : ''}`).join(' ');
export function correctionForUndo(events:ScoreEvent[]) {
	const event = latestAppliedScore(events);
	if (event?.type === 'add_delta') return {mode:'delta' as const, points:Object.fromEntries(event.entries.filter(e=>e.target.kind==='player').map(e=>[e.target.id,String(e.delta)]))};
	if (event?.type === 'add_round') {
		const entries = 'playerCards' in event ? Object.entries(event.playerCards) : event.entries.filter(e=>e.target.kind==='player').map(e=>[e.target.id,e.cards] as const);
		return {mode:'rows' as const, cards:Object.fromEntries(entries.map(([id,cards])=>[id,cardText(cards)]))};
	}
	return null;
}
