import { tableRulesSchema, toWire, validateSchema } from './policy-schema';
/** Executable, game-independent policies for a shared physical-style card table. */
export interface TableRules {
	schemaVersion: 'table-rules/v1';
	players: { min: number; max: number };
	deal: { cardsPerPlayer: number; byPlayerCount?: Record<string, number> };
	layout?: { rows: number; columns: number; initialReveals: number };
	discard: { pickup: 'top' | 'suffix'; immediateUse: boolean };
	meld?: {
		minSet: number;
		maxSet: number;
		minRun: number;
		ace: 'low' | 'both';
	};
	patience?: { columns: 7; draw: 1; recycle: true };
	shedding?: { tableCards: 3; refill: 3; multiDeckFrom: 3; burnTen: boolean; resetTwo: boolean; forcePickupThree: boolean; lowSeven: boolean; fourBurn: boolean };
	contract?: { format: 'rubber'; honors: boolean };
	roundEnd: 'all_revealed' | 'empty_hand' | 'foundations_complete' | 'empty_all' | 'contract_complete';
	stockExhaustion: 'end_round' | 'recycle' | 'continue';
	scoring: {
		zones: { zone: 'hand' | 'meld'; multiplier: 1 | -1 }[];
		columnPairs?: number;
		lowWins: boolean;
		rounds?: number;
		target?: number;
	};
}

export function validateTableRules(value: unknown): asserts value is TableRules {
	validateSchema(toWire(value, tableRulesSchema), tableRulesSchema);
	const r = value as TableRules | undefined;
	if (r && (r.patience || r.shedding || r.contract)) {
		if ([r.patience, r.shedding, r.contract, r.layout, r.meld].filter(Boolean).length !== 1 || r.scoring.zones.length || r.scoring.columnPairs !== undefined || r.scoring.target !== undefined || r.scoring.rounds !== undefined || r.scoring.lowWins || r.discard.immediateUse || r.discard.pickup !== 'top' || r.deal.byPlayerCount) throw new Error('Incompatible capability rules');
		if (r.patience && (r.players.min !== 1 || r.players.max !== 1 || r.deal.cardsPerPlayer !== 1 || r.roundEnd !== 'foundations_complete' || r.stockExhaustion !== 'recycle')) throw new Error('Invalid patience policy');
		if (r.contract && (r.players.min !== 4 || r.players.max !== 4 || r.deal.cardsPerPlayer !== 13 || r.roundEnd !== 'contract_complete' || r.stockExhaustion !== 'continue')) throw new Error('Invalid contract policy');
		if (r.shedding && (r.players.min < 2 || r.players.max > 5 || r.players.max < r.players.min || r.deal.cardsPerPlayer !== 6 || r.roundEnd !== 'empty_all' || r.stockExhaustion !== 'continue')) throw new Error('Invalid shedding policy');
		return;
	}

	const int = (n: unknown, min: number, max: number) =>
		Number.isInteger(n) && Number(n) >= min && Number(n) <= max;
	if (
		!r ||
		r.schemaVersion !== 'table-rules/v1' ||
		!int(r.players?.min, 2, 8) ||
		!int(r.players?.max, r.players.min, 8) ||
		!int(r.deal?.cardsPerPlayer, 1, 25) ||
		Object.entries(r.deal.byPlayerCount ?? {}).some(
			([n, count]) => !int(Number(n), 2, 8) || !int(count, 1, 25)
		) ||
		!['top', 'suffix'].includes(r.discard?.pickup) ||
		typeof r.discard.immediateUse !== 'boolean' ||
		!['all_revealed', 'empty_hand'].includes(r.roundEnd) ||
		r.stockExhaustion !== 'end_round' ||
		typeof r.scoring?.lowWins !== 'boolean' ||
		!Array.isArray(r.scoring.zones) ||
		!r.scoring.zones.length ||
		r.scoring.zones.some(
			(z) => !['hand', 'meld'].includes(z.zone) || ![1, -1].includes(z.multiplier)
		) ||
		(r.scoring.rounds !== undefined && !int(r.scoring.rounds, 1, 99)) ||
		(r.scoring.target !== undefined && !int(r.scoring.target, 1, 100000))
	)
		throw new Error('Invalid table rules');
	if (
		r.layout &&
		(!int(r.layout.rows, 1, 5) ||
			!int(r.layout.columns, 1, 5) ||
			r.layout.rows * r.layout.columns !== r.deal.cardsPerPlayer ||
			!int(r.layout.initialReveals, 0, r.deal.cardsPerPlayer - 1))
	)
		throw new Error('Invalid table layout');
	if (
		r.meld &&
		(!int(r.meld.minSet, 3, 4) ||
			!int(r.meld.maxSet, r.meld.minSet, 4) ||
			!int(r.meld.minRun, 3, 13) ||
			!['low', 'both'].includes(r.meld.ace))
	)
		throw new Error('Invalid meld policy');
	if (r.roundEnd === 'all_revealed' && !r.layout)
		throw new Error('Incompatible table rules: roundEnd all_revealed requires layout');
	if (r.roundEnd === 'empty_hand' && !r.meld)
		throw new Error('Incompatible table rules: roundEnd empty_hand requires meld');
	if (r.layout && r.meld)
		throw new Error(
			'Incompatible table rules: layout and meld are mutually exclusive: use meld=null for a grid game'
		);
	if (r.layout && r.discard.pickup !== 'top')
		throw new Error('Incompatible table rules: layout requires discard.pickup=top');
	if (r.discard.immediateUse && !r.meld)
		throw new Error(
			'Incompatible table rules: discard.immediateUse requires meld; use false for a grid game'
		);
	if (
		r.scoring.columnPairs !== undefined &&
		(r.layout?.rows !== 2 || r.scoring.columnPairs !== r.layout.columns)
	)
		throw new Error(
			'Incompatible table rules: scoring.columnPairs must equal layout.columns with exactly two rows, or be null for hand games'
		);

	if (new Set(r.scoring.zones.map((z) => z.zone)).size !== r.scoring.zones.length)
		throw new Error('Invalid scoring zones: each zone may appear only once');
	if (!r.meld && r.scoring.zones.some((z) => z.zone === 'meld'))
		throw new Error(
			'Invalid scoring zones: meld zone requires a meld policy; grid layouts score the hand zone only'
		);

	for (let n = r.players.min; n <= r.players.max; n++) {
		const count = r.deal.byPlayerCount?.[n] ?? r.deal.cardsPerPlayer;
		if (n * count >= 52 || (r.layout && count !== r.deal.cardsPerPlayer))
			throw new Error('Deal exceeds deck or layout capacity');
	}
}

export function deckCountFor(r: TableRules, players: number): number { return r.shedding && players >= r.shedding.multiDeckFrom ? 2 : 1; }
