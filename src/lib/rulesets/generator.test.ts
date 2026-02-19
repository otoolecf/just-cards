import { describe, expect, it } from 'vitest';

import {
	compileRuleFactsToBundle,
	extractRuleFacts,
	generateRulesetDraftFromInput,
	type RuleFactsV0
} from './generator';

const SIX_CARD_GOLF_LIKE_TEXT = `
Six Card Golf
Players: 2 to 4
Object: Lowest score wins after nine rounds.
Deal six cards to each player in a 2x3 layout. Two cards are face up.
The remaining cards stay face down until revealed.
On your turn, draw the top card from stock or discard pile.
You may replace one card in your layout and discard the replaced card.
Round ends when one player has all cards face up.
Scoring: Ace = 1, Two = -2, King = 0, Queen and Jack = 10, others face value.
`;

const FREEFORM_PROSE = `
okay so we play with like 3 or 4 people and everyone gets 5 cards.
we have a hand and a discard pile and can draw from discard or deck.
on your turn you put one card down to a meld area and then next player goes.
we score at end of round by card values and lower is better.
`;

const NATURAL_LANGUAGE_SCORING = `
Scoring
Each ace counts 1 point.
Each 2 counts minus 2 points.
Each numeral card from 3 to 10 scores face value.
Each jack or queen scores 10 points.
Each king scores zero points.
`;

const RUMMY_500_DISCARD_PICKUP_TEXT = `
500 Rum
Players: 2 to 8
Deal seven cards to each player.
Each player may draw either the top card of the stock or any card from the discard pile.
When drawing from discard, the player must take all the cards above the selected card.
The selected card must immediately be used by laying it in a meld.
The remaining cards may be melded or added to hand.
First player to 500 points wins.
`;

describe('ruleset generator', () => {
	it('extract_rule_facts_detects_six_card_golf_signals', () => {
		const facts = extractRuleFacts({
			sourceText: SIX_CARD_GOLF_LIKE_TEXT,
			sourceUrl: 'https://bicyclecards.com/how-to-play/six-card-golf'
		});

		expect(facts.schemaVersion).toBe('rule-facts/v0');
		expect(facts.gameName.toLowerCase()).toContain('golf');
		expect(facts.players.min).toBe(2);
		expect(facts.players.max).toBe(4);
		expect(facts.turn.drawSources).toEqual(expect.arrayContaining(['stock', 'discard']));
		expect(facts.turn.drawThenResolve).toBe(true);
		expect(facts.scoring.lowScoreWins).toBe(true);
		expect(facts.scoring.rankOverrides['K']).toBe(0);
		expect(facts.scoring.rankOverrides['J']).toBe(10);
		expect(facts.scoring.rankOverrides['Q']).toBe(10);
		expect(facts.rounds).toBe(9);
		expect(facts.diagnostics.some((line) => line.toLowerCase().includes('face up'))).toBe(true);
		expect(facts.diagnostics.some((line) => line.toLowerCase().includes('face down'))).toBe(true);
		expect(facts.setup?.cardsPerPlayer).toBe(6);
		expect(facts.setup?.initialFaceUpCards).toBe(2);
		expect(facts.setup?.playerLayout).toEqual({ kind: 'grid', rows: 2, columns: 3 });
		expect(facts.setup?.drawVisibility?.stock).toBe('preserve');
	});

	it('extract_rule_facts_layout_only_language_does_not_force_board_zone', () => {
		const facts = extractRuleFacts({
			sourceText: `
			Players: 2 to 4
			Deal six cards to each player in a 2x3 layout.
			Draw from stock or discard.
			Replace a layout card and discard the replaced card.
		`
		});

		expect(facts.zones).toEqual(expect.arrayContaining(['stock', 'discard']));
		expect(facts.zones.includes('board')).toBe(false);
	});

	it('extract_rule_facts_handles_stream_of_consciousness_input', () => {
		const facts = extractRuleFacts({
			sourceText: FREEFORM_PROSE
		});

		expect(facts.schemaVersion).toBe('rule-facts/v0');
		expect(facts.players.min).toBeGreaterThanOrEqual(2);
		expect(facts.turn.playTargets.length).toBeGreaterThan(0);
		expect(facts.zones.includes('discard')).toBe(true);
		expect(facts.diagnostics.length).toBeGreaterThanOrEqual(0);
	});

	it('extract_rule_facts_detects_natural_language_rank_scoring_overrides', () => {
		const facts = extractRuleFacts({
			sourceText: NATURAL_LANGUAGE_SCORING
		});

		expect(facts.scoring.aceValue).toBe(1);
		expect(facts.scoring.rankOverrides['A']).toBe(1);
		expect(facts.scoring.rankOverrides['2']).toBe(-2);
		expect(facts.scoring.rankOverrides['J']).toBe(10);
		expect(facts.scoring.rankOverrides['Q']).toBe(10);
		expect(facts.scoring.rankOverrides['K']).toBe(0);
	});

	it('extract_rule_facts_detects_discard_pickup_and_immediate_use_turn_rules', () => {
		const facts = extractRuleFacts({
			sourceText: RUMMY_500_DISCARD_PICKUP_TEXT,
			sourceUrl: 'https://bicyclecards.com/how-to-play/500-rum'
		});

		expect(facts.turn.drawSources).toEqual(expect.arrayContaining(['stock', 'discard']));
		expect(facts.turn.sourceDrawRules).toEqual(
			expect.arrayContaining([
				{
					zoneId: 'discard',
					pickMode: 'any_visible',
					requireTakeAbove: true,
					requireResolveIncludesPicked: true
				}
			])
		);
	});

	it('compile_rule_facts_to_bundle_returns_runtime_bundle_v1', () => {
		const facts: RuleFactsV0 = extractRuleFacts({
			sourceText: FREEFORM_PROSE
		});
		const bundle = compileRuleFactsToBundle(facts);

		expect(bundle.bundleVersion).toBe('runtime-bundle/v1');
		expect(bundle.runtimeRulePack).toBeDefined();
		expect(bundle.uiProfile.schemaVersion).toBe('ui-profile/v0');
		expect(bundle.uiProfile.table.zones.length).toBeGreaterThan(0);
		expect(bundle.uiProfile.hand.quickPlayTargets.length).toBeGreaterThan(0);
		expect(bundle.explain?.schemaVersion).toBe('ruleset-explain/v0');
		expect(bundle.explain?.goal.length ?? 0).toBeGreaterThan(0);
	});

	it('compile_rule_facts_to_bundle_maps_setup_to_ui_profile', () => {
		const facts = extractRuleFacts({
			sourceText: SIX_CARD_GOLF_LIKE_TEXT,
			sourceUrl: 'https://bicyclecards.com/how-to-play/six-card-golf'
		});
		const bundle = compileRuleFactsToBundle(facts);

		expect(bundle.uiProfile.hand.layout).toEqual({ kind: 'grid', rows: 2, columns: 3 });
		expect(bundle.runtimeRulePack.gameplayRulePack?.turnActionPolicy).toEqual({
			enabled: true,
			allowedPhases: ['play'],
			drawFromZoneAllowlist: ['stock', 'discard'],
			resolveToZoneAllowlist: ['discard'],
			requireDrawBeforeResolve: true,
			requireResolveAfterDraw: true,
			drawSourcePolicies: []
		});
		expect(bundle.uiProfile.seats?.cards).toEqual({
			zoneId: 'hand',
			label: 'Player Layouts',
			includeSelf: false,
			layout: { kind: 'grid', rows: 2, columns: 3 }
		});
		expect(bundle.uiProfile.table.zones.find((zone) => zone.id === 'stock')?.drawVisibility).toBe('preserve');
	});

	it('compile_rule_facts_to_bundle_maps_discard_pickup_rule_to_runtime_and_ui', () => {
		const facts = extractRuleFacts({
			sourceText: RUMMY_500_DISCARD_PICKUP_TEXT,
			sourceUrl: 'https://bicyclecards.com/how-to-play/500-rum'
		});
		const bundle = compileRuleFactsToBundle(facts);

		expect(bundle.runtimeRulePack.gameplayRulePack?.turnActionPolicy?.drawSourcePolicies).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					zoneId: 'discard',
					minCards: 1,
					requireContiguousFromTop: true,
					requireResolveIncludesAnchor: true,
					requiredResolveTargetZoneAllowlist: ['meld']
				})
			])
		);
		expect(bundle.runtimeRulePack.gameplayRulePack?.zoneMovePolicy.maxCards).toBeUndefined();
		expect(bundle.uiProfile.table.zones.find((zone) => zone.id === 'discard')?.drawPickMode).toBe('any_visible');
	});

	it('generate_ruleset_draft_from_url_ingests_html_and_compiles', async () => {
		const html = `
		<html>
			<head><title>How to Play Six Card Golf</title></head>
			<body>
				<h1>Six Card Golf</h1>
				<p>Players: 2 to 4</p>
				<p>Draw from stock or discard pile.</p>
				<p>Lowest score wins after nine rounds.</p>
			</body>
		</html>
		`;

		const generated = await generateRulesetDraftFromInput(
			{
				source: { type: 'url', url: 'https://example.com/six-card-golf' }
			},
			{
				fetchImpl: async () =>
					new Response(html, {
						status: 200,
						headers: { 'content-type': 'text/html; charset=utf-8' }
					})
			}
		);

		expect(generated.draft.bundle.bundleVersion).toBe('runtime-bundle/v1');
		expect(generated.draft.bundle.displayName.toLowerCase()).toContain('golf');
		expect(generated.facts.source.type).toBe('url');
	});
});
