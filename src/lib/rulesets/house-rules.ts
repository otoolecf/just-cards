import {
	createRulePack,
	cardValue,
	type CardRank,
	type RulePack,
} from '$lib/scorekeeper/engine';
import { validateTableRules } from '$lib/gameplay/table-rules';
import { compileRuleFactsToBundle } from './generator';
import {
	extractionFromBundle,
	factsFromExtraction,
	parseExtraction,
	executableLeaves,
} from './extraction-contract';
import {
	buildGenerationReport,
	acceptRulesetReview,
	canPlayRuleset,
} from './generation-report';
import type { RulesetRecord, RuntimeRulesetBundle } from './types';

export const houseRanks: CardRank[] = [
	'A',
	'2',
	'3',
	'4',
	'5',
	'6',
	'7',
	'8',
	'9',
	'10',
	'J',
	'Q',
	'K',
];
export interface HouseRuleSettings {
 shedding?: import('../gameplay/table-rules').TableRules['shedding'];
	minPlayers: number;
	maxPlayers: number;
	cardsPerPlayer: number;
	twoPlayerCards: number;
	rounds: number | null;
	target: number | null;
	initialReveals: number;
	cancelPairs: boolean;
	ace: 'low' | 'both';
	cardValues: Record<CardRank, number>;
}
export function houseRuleSettings(b: RuntimeRulesetBundle): HouseRuleSettings {
	const r = b.runtimeRulePack.tableRules;
	if (!r) throw new Error('This game does not have editable table rules.');
	const pack = (b.runtimeRulePack.scoreRulePack ??
		createRulePack()) as RulePack;
	return {
		...(r.shedding?{shedding:structuredClone(r.shedding)}:{}),
		minPlayers: r.players.min,
		maxPlayers: r.players.max,
		cardsPerPlayer: r.deal.cardsPerPlayer,
		twoPlayerCards: r.deal.byPlayerCount?.['2'] ?? r.deal.cardsPerPlayer,
		rounds: r.scoring.rounds ?? null,
		target: r.scoring.target ?? null,
		initialReveals: r.layout?.initialReveals ?? 0,
		cancelPairs: !!r.scoring.columnPairs,
		ace: r.meld?.ace ?? 'both',
		cardValues: Object.fromEntries(
			houseRanks.map((rank) => [rank, cardValue({ rank }, pack)]),
		) as Record<CardRank, number>,
	};
}
export function createHouseRules(
	parent: RulesetRecord,
	name: string,
	settings: HouseRuleSettings,
): RuntimeRulesetBundle {
	if (!canPlayRuleset(parent.bundle))
		throw new Error(
			'Review this ruleset and make it ready before customizing it.',
		);
	if (typeof name !== 'string' || !name.trim() || name.trim().length > 80)
		throw new Error('Choose a name between 1 and 80 characters.');
	if(parent.bundle.runtimeRulePack.tableRules?.patience || parent.bundle.runtimeRulePack.tableRules?.contract) throw new Error('This preset does not use the card-value house-rule editor. Duplicate it to save a named copy.');
 if(parent.bundle.runtimeRulePack.tableRules?.shedding){
  const bundle=structuredClone(parent.bundle),r=bundle.runtimeRulePack.tableRules!;
  if(!settings?.shedding)throw new Error('Choose the Palace effect settings');
  r.shedding=structuredClone(settings.shedding);validateTableRules(r);
  bundle.displayName=name.trim();bundle.gameId=`${parent.bundle.gameId}-family`;
  bundle.houseRules={version:'house-rules/v1',parentId:parent.id,parentName:parent.name,createdAt:new Date().toISOString()};
  delete bundle.generationReport;
  if(bundle.explain)bundle.explain.diagnostics=[
   'Custom Palace rules. Choose three face-up cards from six, with three blind cards underneath. Refill to three while stock remains; hand first, then face-up, then blind. First out wins.',
   `2 resets: ${r.shedding.resetTwo?'yes':'no'}. 10 clears and plays again: ${r.shedding.burnTen?'yes':'no'}. Three forces next pickup and skips them: ${r.shedding.forcePickupThree?'yes':'no'}. Seven requires next play 7 or lower: ${r.shedding.lowSeven?'yes':'no'}. Four consecutive equal ranks clear and pass: ${r.shedding.fourBurn?'yes':'no'}.`,
   'Enabled 2 and 10 effects are wild. Three obeys the current rank restriction. Otherwise play equal or higher; pick up only when unable. Failed blind plays join the picked-up pile. One deck for two, two decks for three to five.'
  ];return bundle;
 }
	const s = settings;
	if (
		!s ||
		typeof s.cancelPairs !== 'boolean' ||
		!['low', 'both'].includes(s.ace) ||
		!Number.isInteger(s.initialReveals) ||
		!houseRanks.every(
			(rank) =>
				typeof s.cardValues?.[rank] === 'number' &&
				Number.isInteger(s.cardValues[rank]) &&
				Math.abs(s.cardValues[rank]) <= 100,
		)
	)
		throw new Error('Enter valid house rules. Card points must be whole numbers from -100 to 100.');
	const r = structuredClone(parent.bundle.runtimeRulePack.tableRules!);
	r.players = { min: s.minPlayers, max: s.maxPlayers };
	if (r.layout) {
		if (
			s.cardsPerPlayer !== r.deal.cardsPerPlayer ||
			s.twoPlayerCards !== r.deal.cardsPerPlayer
		)
			throw new Error('Fixed layouts must keep their card count.');
		r.layout.initialReveals = s.initialReveals;
		if (s.cancelPairs) r.scoring.columnPairs = r.layout.columns;
		else delete r.scoring.columnPairs;
	} else {
		r.deal = {
			cardsPerPlayer: s.cardsPerPlayer,
			byPlayerCount: { ...r.deal.byPlayerCount, '2': s.twoPlayerCards },
		};
		if (r.meld) r.meld.ace = s.ace;
	}
	if (s.rounds === null) delete r.scoring.rounds;
	else r.scoring.rounds = s.rounds;
	if (s.target === null) delete r.scoring.target;
	else r.scoring.target = s.target;
	if (!r.scoring.rounds && !r.scoring.target)
		throw new Error('Choose a round limit or target score.');
	validateTableRules(r);
	const draft = structuredClone(parent.bundle);
	draft.runtimeRulePack.tableRules = r;
	draft.displayName = name.trim();
	const extraction = extractionFromBundle(draft);
	extraction.cardValues = { ...s.cardValues };
	const e = parseExtraction(extraction);
	e.assumptions = executableLeaves({
		tableRules: e.tableRules,
		cardValues: e.cardValues,
	}).map((path) => ({
		path,
		reason: 'Explicitly chosen family rules, based on ' + parent.name + '.',
	}));
	const bundle = compileRuleFactsToBundle(
		factsFromExtraction(e, { type: 'text' }),
	);
	bundle.houseRules = {
		version: 'house-rules/v1',
		parentId: parent.id,
		parentName: parent.name,
		createdAt: new Date().toISOString(),
	};
	bundle.generationReport = buildGenerationReport(
		bundle,
		e,
		'',
		{
			verdict: 'unavailable',
			issues: [],
			summary:
				'Manually configured family variant. Source rules are not claimed to match these changes.',
		},
		'deterministic',
	);
	if (bundle.generationReport.status === 'blocked')
		throw new Error(bundle.generationReport.blockers.join(' '));
	return acceptRulesetReview(bundle);
}
