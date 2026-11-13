import { deriveState, createRulePack, type ScoreEvent } from '../scorekeeper/engine';
import { emptyRubber, scoreContract } from '../gameplay/contract-scoring';
import { settleMahjong } from '../gameplay/mahjong';
import { appliedScoreEvents } from '../session/score-correction';
import { scoreRoundProgress, roundProgressMetadata } from '../session/score-round-progress';
import type { GuidedScoreProfile } from '../session/score-session-commands';
import type { SessionStateView } from '../session/score-session-api';
import type { RoomView } from '../server/room-service';
import type { RulesetRecord } from '../rulesets/types';

export interface ResultPlayer {
	name: string;
	anonymousName: string;
	total: number;
	hands: (number | null)[];
	rank: number;
}
export interface ShareResult {
	gameName: string;
	lowWins: boolean;
	players: ResultPlayer[];
	handCount: number;
	winnerText: string;
	partnerships: boolean;
	outcome?: 'lost';
	adjusted: boolean;
}
interface ResultInput {
	gameName: string;
	lowWins: boolean;
	players: { id: string; name: string }[];
	hands: Record<string, number>[];
	totals: Record<string, number>;
	partnerships?: boolean;
	outcome?: 'lost';
}
const clean = (value: string) => Array.from(value.replace(/[\r\n\t\u2028\u2029\u202a-\u202e\u2066-\u2069]+/g, ' ').trim()).slice(0, 80).join('');
const joinNames = (names: string[]) => names.length <= 2 ? names.join(' & ') : `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`;

export function winnerText(result: ShareResult, names = true): string {
	if (result.outcome === 'lost') return 'Deal conceded';
	const winners = result.players.filter(player => player.rank === 1).map(player => names ? player.name : player.anonymousName);
	return `${joinNames(winners)} ${winners.length > 1 ? 'tie' : result.partnerships ? 'win' : 'wins'}!`;
}

/** Only this deliberately small public model can reach a renderer or share API. */
export function createResult(input: ResultInput): ShareResult {
	const partnerships = Boolean(input.partnerships && input.players.length === 4);
	const groups = partnerships ? [[input.players[0], input.players[2]], [input.players[1], input.players[3]]] : input.players.map(player => [player]);
	const rows = groups.map((group, index) => {
		const total = input.totals[group[0].id] ?? 0;
		if (!Number.isFinite(total)) throw new Error('Unable to share invalid score totals.');
		return {
			name: group.map(player => clean(player.name)).join(' & '),
			anonymousName: `${partnerships ? 'Team' : 'Player'} ${index + 1}`,
			total,
			hands: input.hands.map(hand => {
				const value = group.map(player => hand[player.id]).find(value => value !== undefined);
				if (value !== undefined && !Number.isFinite(value)) throw new Error('Unable to share an invalid hand score.');
				return value ?? null;
			}),
			rank: 0
		};
	});
	for (const row of rows) row.rank = 1 + rows.filter(other => input.lowWins ? other.total < row.total : other.total > row.total).length;
	rows.sort((a, b) => a.rank - b.rank);
	const result: ShareResult = {
		gameName: clean(input.gameName) || 'Score sheet', lowWins: input.lowWins,
		players: rows, handCount: input.hands.length, winnerText: '', partnerships,
		...(input.outcome ? { outcome: input.outcome } : {}),
		adjusted: rows.some(row => Math.abs(row.hands.reduce<number>((sum, value) => sum + (value ?? 0), 0) - row.total) > 1e-9)
	};
	result.winnerText = winnerText(result);
	return result;
}

export function resultText(result: ShareResult, names = true, site = 'justcards.app'): string {
	const winner = winnerText(result, names);
	const lines = [
		`Just Cards · ${result.gameName}`,
		`Final · ${result.handCount} ${result.handCount === 1 ? 'hand' : 'hands'} · ${result.lowWins ? 'Lower' : 'Higher'} wins`,
		' '.repeat(Math.max(0, Math.floor((32 - winner.length) / 2))) + winner,
		''
	];
	const labels = result.players.map(player => names ? player.name : player.anonymousName);
	const width = Math.min(20, Math.max(...labels.map(label => label.length), 0));
	result.players.forEach((player, index) => lines.push(`${labels[index].padEnd(width)}  ${player.hands.map(value => value === null ? '—' : String(value)).join(' ')} → ${player.total}`));
	if (result.adjusted) lines.push('', 'Totals include adjustments.');
	lines.push('', site);
	return lines.join('\n');
}

export type HandBand = 'best' | 'middle' | 'last' | 'tied';
export function handBand(values: number[], value: number, lowWins: boolean): HandBand {
	const min = Math.min(...values), max = Math.max(...values);
	if (min === max) return 'tied';
	if (value === (lowWins ? min : max)) return 'best';
	if (value === (lowWins ? max : min)) return 'last';
	return 'middle';
}

export function resultProfile(profile: GuidedScoreProfile | null, rulesets: RulesetRecord[]): GuidedScoreProfile | null {
	if (!profile) return null;
	const table = rulesets.find(record => record.id === profile.rulesetId)?.bundle.runtimeRulePack.tableRules;
	return { ...profile, roundProgress: roundProgressMetadata(profile, rulesets), targetScore: profile.targetScore ?? table?.scoring.target };
}

export function scoreIsComplete(session: Pick<SessionStateView, 'events' | 'state'>, profile: GuidedScoreProfile | null): boolean {
	if (!profile) return false;
	if (session.state.rubber?.finished || session.state.mahjong?.finished) return true;
	if (scoreRoundProgress(session.events.map(event => event.scoreEvent), profile.roundProgress)?.complete) return true;
	if (profile.targetScore && Object.values(session.state.totalsByPlayer).some(total => total >= profile.targetScore!)) return true;
	return ['outcome', 'solo_outcome'].includes(profile.roundScoring ?? '') && appliedScoreEvents(session.events.map(event => event.scoreEvent)).some(event => event.type === 'add_delta');
}

export function scoreHasFinishRule(profile: GuidedScoreProfile | null): boolean {
	if (!profile) return false;
	return scoreRoundProgress([], profile.roundProgress)?.total !== undefined || Boolean(profile.targetScore) || ['contract', 'mahjong', 'solo_outcome', 'outcome'].includes(profile.roundScoring ?? '');
}

export function scoreResult(session: Pick<SessionStateView, 'config' | 'state' | 'events'>, profile: GuidedScoreProfile | null, gameName: string): ShareResult | null {
	const events = appliedScoreEvents(session.events.map(event => event.scoreEvent));
	if (!events.length || !Object.keys(session.state.totalsByPlayer).length) return null;
	let rubber = emptyRubber();
	const hands: Record<string, number>[] = [];
	for (const event of events) {
		if (event.type === 'add_contract') {
			const scored = scoreContract(rubber, event.result); rubber = scored.state;
			hands.push(Object.fromEntries(event.players.map((id, i) => [id, scored.delta[i % 2]])));
		} else if (event.type === 'add_mahjong') {
			hands.push(settleMahjong(event.players, event.result, event.policy));
		} else if (event.type === 'add_delta' || event.type === 'add_round') {
			hands.push(deriveState([event], session.config.scoreRulePack ?? profile?.scoreRulePack ?? createRulePack()).totalsByPlayer);
		}
	}
	const players = session.config.players?.length ? session.config.players : Object.keys(session.state.totalsByPlayer);
	return createResult({ gameName, players: players.map(name => ({ id: name, name })), hands, totals: session.state.totalsByPlayer,
		lowWins: (session.config.scoreWinDirection ?? profile?.winDirection) === 'low_wins',
		partnerships: profile?.roundScoring === 'contract',
		...(profile?.roundScoring === 'solo_outcome' && Object.values(hands.at(-1) ?? {}).every(score => score === 0) ? { outcome: 'lost' as const } : {})
	});
}

export function roomResult(room: RoomView): ShareResult | null {
	const table = room.table;
	if (!table?.scores.length || (!room.closed && table.stage !== 'game_end')) return null;
	const seats = [...room.seats, ...room.pastSeats];
	// The authoritative final roster determines eligibility; past seats still supply names.
	const ids = [...table.players];
	return createResult({ gameName: room.name, lowWins: room.rules.scoring.lowWins,
		players: ids.map(id => ({ id, name: seats.find(seat => seat.id === id)?.name ?? 'Player' })),
		hands: table.scores, totals: table.totals, partnerships: Boolean(room.rules.contract),
		...(room.rules.patience && !table.winners.length ? { outcome: 'lost' as const } : {})
	});
}
