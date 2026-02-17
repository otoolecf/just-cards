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
		expect(facts.scoring.lowScoreWins).toBe(true);
		expect(facts.scoring.rankOverrides['K']).toBe(0);
		expect(facts.scoring.rankOverrides['J']).toBe(10);
		expect(facts.scoring.rankOverrides['Q']).toBe(10);
		expect(facts.rounds).toBe(9);
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
