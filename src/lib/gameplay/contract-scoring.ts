import type { CardSuit } from '../scorekeeper/engine';
export type Strain = CardSuit | 'notrump';
export interface RubberState {
	below: [number, number];
	games: [number, number];
	totals: [number, number];
	finished: boolean;
}
export interface ContractResult {
	team: 0 | 1;
	level: number;
	strain: Strain;
	doubling: 1 | 2 | 4;
	tricks: number;
	honors?: [number, number];
}
export function emptyRubber(): RubberState {
	return { below: [0, 0], games: [0, 0], totals: [0, 0], finished: false };
}
/** Rubber (not duplicate) scoring. Below is progress toward the current game; totals include every point once. */
export function scoreContract(
	prior: RubberState,
	result: ContractResult,
): { state: RubberState; delta: [number, number]; description: string } {
	const { team, level, strain, doubling, tricks } = result;
	if (
		prior.finished ||
		![0, 1].includes(team) ||
		!Number.isInteger(level) ||
		level < 1 ||
		level > 7 ||
		!Number.isInteger(tricks) ||
		tricks < 0 ||
		tricks > 13 ||
		![1, 2, 4].includes(doubling) ||
		!['clubs', 'diamonds', 'hearts', 'spades', 'notrump'].includes(strain)
	)
		throw new Error('Invalid contract result');
	const state = structuredClone(prior),
		delta: [number, number] = [0, 0],
		opponent = 1 - team,
		vulnerable = prior.games[team] > 0,
		over = tricks - level - 6,
		minor = ['clubs', 'diamonds'].includes(strain);
	if (over >= 0) {
		const below =
			((minor ? 20 : 30) * level + (strain === 'notrump' ? 10 : 0)) * doubling;
		state.below[team] += below;
		delta[team] += below;
		delta[team] +=
			over *
			(doubling === 1
				? minor
					? 20
					: 30
				: (vulnerable ? 200 : 100) * (doubling / 2));
		if (doubling > 1) delta[team] += 50 * (doubling / 2);
		if (level === 6) delta[team] += vulnerable ? 750 : 500;
		if (level === 7) delta[team] += vulnerable ? 1500 : 1000;
		if (state.below[team] >= 100) {
			state.games[team]++;
			state.below = [0, 0];
			if (state.games[team] === 2) {
				state.finished = true;
				delta[team] += state.games[opponent] === 0 ? 700 : 500;
			}
		}
	} else {
		const down = -over;
		delta[opponent] +=
			doubling === 1
				? down * (vulnerable ? 100 : 50)
				: (vulnerable
						? 200 + 300 * (down - 1)
						: 100 + 200 * Math.min(2, down - 1) + 300 * Math.max(0, down - 3)) *
					(doubling / 2);
	}
	const honors = result.honors ?? [0, 0];
	if (
		honors.length !== 2 ||
		honors.some((n) => ![0, 100, 150].includes(n)) ||
		honors.filter(Boolean).length > 1 ||
		(strain === 'notrump' && honors.includes(100))
	)
		throw new Error('Invalid honors');
	for (const i of [0, 1]) {
		delta[i] += honors[i];
		state.totals[i] += delta[i];
	}
	return {
		state,
		delta,
		description: `${level} ${strain}${doubling === 2 ? ' doubled' : doubling === 4 ? ' redoubled' : ''}: ${over >= 0 ? `made${over ? ` +${over}` : ''}` : `down ${-over}`}`,
	};
}
