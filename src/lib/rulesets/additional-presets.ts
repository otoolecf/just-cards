import { createRulePack } from '../scorekeeper/engine';
import { generateUiProfileFromRuntime } from '../ui/ui-profile';
import { validateTableRules, type TableRules } from '../gameplay/table-rules';
import type { RulesetRecord, RuntimeRulesetBundle } from './types';
const base: Pick<TableRules, 'schemaVersion' | 'discard' | 'scoring'> = {
	schemaVersion: 'table-rules/v1',
	discard: { pickup: 'top', immediateUse: false },
	scoring: { zones: [], lowWins: false },
};
const common = () => structuredClone(base);
const shedding = (family: boolean): TableRules => ({
	...common(),
	players: { min: 2, max: 5 },
	deal: { cardsPerPlayer: 6 },
	roundEnd: 'empty_all',
	stockExhaustion: 'continue',
	shedding: {
		tableCards: 3,
		refill: 3,
		multiDeckFrom: 3,
		burnTen: true,
		resetTwo: true,
		forcePickupThree: family,
		lowSeven: family,
		fourBurn: true,
	},
});
export function additionalRulesets(): RulesetRecord[] {
	const presets: {
		id: string;
		name: string;
		path: string;
		rules: TableRules;
		goal: string;
		notes: string[];
	}[] = [
		{
			id: 'solitaire',
			name: 'Solitaire (draw-one Klondike)',
			path: 'solitaire',
			rules: {
				...common(),
				players: { min: 1, max: 1 },
				deal: { cardsPerPlayer: 1 },
				patience: { columns: 7, draw: 1, recycle: true },
				roundEnd: 'foundations_complete',
				stockExhaustion: 'recycle',
			},
			goal: 'Build all four suited foundations from Ace to King.',
			notes: [
				'Seven tableau columns build down in alternating colors; only Kings fill empty columns. Move face-up sequences together.',
				'Draw one stock card at a time. Recycle the waste without a limit. Foundation cards may move back to the tableau.',
				'Alternating colors, draw-one and unlimited recycling are explicit Klondike defaults; the Bicycle overview does not specify every variant. One point per completed deal; concede scores zero.',
			],
		},
		{
			id: 'bridge',
			name: 'Bridge (rubber)',
			path: 'bridge',
			rules: {
				...common(),
				players: { min: 4, max: 4 },
				deal: { cardsPerPlayer: 13 },
				contract: { format: 'rubber', honors: true },
				roundEnd: 'contract_complete',
				stockExhaustion: 'continue',
			},
			goal: 'Bid and win tricks with your opposite-seat partner. Complete a rubber of two games.',
			notes: [
				'Four human players; partners are seats 1 & 3 and 2 & 4. Dealer opens the auction. Bid higher, pass, double opponents or redouble your partnership. Three passes close a contract; four opening passes redeal.',
				'Declarer is the first partner to bid the final strain. Left opponent leads, then dummy becomes public. Declarer plays both hands. Follow suit when possible. Highest trump, otherwise highest card of the led suit wins.',
				'Rubber scoring includes below-line game progress, vulnerability, over/undertricks, doubling, slams and single-hand honors. Two games finish the rubber; highest total wins. Keep seats fixed; use private recovery links for replacements.',
				'This is rubber Bridge, with no bots or duplicate tournament scoring. Ending the room early does not award unfinished-rubber settlement bonuses.',
			],
		},
		{
			id: 'palace',
			name: 'Palace (Bicycle)',
			path: 'palace',
			rules: shedding(false),
			goal: 'Be first to play all hand, face-up and blind cards.',
			notes: [
				'Choose three of your six hand cards for the face-up row. Three blind cards stay hidden. Refill your hand to three until stock is empty. Use your hand, then face-up cards, then reveal one blind card at a time.',
				'Play equal or higher (Ace high), optionally several of one rank. If unable, pick up the whole pile and pass. A failed blind play joins the picked-up pile.',
				'2 is wild and resets the restriction. 10 is wild, clears the pile and gives another turn. Four consecutive equal ranks clear the pile and pass the turn. First out wins one point.',
				'Two players use one deck; three to five use two. First player faces a stock card to start. Other Shithead/Palace variants differ; this preset follows Bicycle.',
			],
		},
		{
			id: 'palace-family',
			name: 'Palace (family rules)',
			path: 'palace',
			rules: shedding(true),
			goal: 'Be first to play all your cards, using the family special-card rules.',
			notes: [
				'Choose three face-up cards from six; three blind cards stay hidden. Hand first, then face-up, then blind. Refill to three while stock remains. First out wins one point.',
				'10 is wild: clear the pile and play again. 2 is wild: anything may follow. 3 makes the next player pick up the pile and lose their turn. After 7, the next play must be 7 or lower; 2 and 10 remain wild.',
				'House-rule assumption: 3 must satisfy the current rank restriction; it is not wild. Equal-rank multiples are allowed. Four consecutive equal ranks clear and pass.',
				'A failed blind card goes into the pile before you pick it up. Two players use one deck; three to five use two. Based on Bicycle Palace and Pagat Shithead, with the requested family overrides.',
			],
		},
	];
	return presets.map((p) => {
		validateTableRules(p.rules);
		const sourceUrl = `https://bicyclecards.com/how-to-play/${p.path}`;
		const runtimeRulePack = {
			tableRules: p.rules,
			scoreRulePack: createRulePack(),
			scoringTriggers: [],
		};
		const uiProfile = generateUiProfileFromRuntime(runtimeRulePack);
		uiProfile.scorekeeper = { patternRound: false };
		const bundle: RuntimeRulesetBundle = {
			bundleVersion: 'runtime-bundle/v1',
			gameId: p.id,
			displayName: p.name,
			runtimeRulePack,
			uiProfile,
			explain: {
				schemaVersion: 'ruleset-explain/v0',
				goal: p.goal,
				playerRange: p.rules.players,
				turnFlow: { drawFrom: [], playTo: [] },
				scoring: { lowScoreWins: false, aceValue: 1, rankOverrides: [] },
				zones: [],
				diagnostics: p.notes,
				source: { type: 'url', url: sourceUrl },
				generatedAt: '2026-09-20T00:00:00.000Z',
			},
		};
		return {
			id: `builtin-${p.id}`,
			name: p.name,
			origin: 'import',
			sourceUrl,
			bundle,
			createdAt: '2026-09-20T00:00:00.000Z',
			updatedAt: '2026-09-20T00:00:00.000Z',
		};
	});
}
