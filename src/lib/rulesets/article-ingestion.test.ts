import { expect, it } from 'vitest';
import { extractRuleFacts, generateRulesetDraftFromInput, ingestSource } from './generator';

it('keeps incomplete meld rules as a draft instead of inventing a pickup or scoring protocol', () => {
	expect(
		extractRuleFacts({
			sourceText: `Example game. 2 to 4 players. Deal seven cards to each player.
Draw from stock or discard. Sets of 3 or 4 and sequences of 3 or more cards of the same suit.`
		}).tableRules
	).toBeUndefined();
});

it('isolates article rules from unrelated site navigation and recommendations', async () => {
	const html = `<html><nav>Six Card Golf. Each king scores zero points.</nav><h1>500 Rum</h1>
 <div>Players</div><div>2, 3, 4, 5+</div><h3>The Deal</h3><p>Deal seven cards to each player.
 Draw from stock or discard. Sets of 3 or 4 and sequences of 3 or more cards of the same suit.</p>
 <div>Related games</div><p>Six Card Golf. Each 2 counts minus 2 points.</p></html>`;
	const result = await generateRulesetDraftFromInput(
		{
			source: {
				type: 'url',
				url: 'https://bicyclecards.com/how-to-play/500-rum'
			}
		},
		{
			fetchImpl: async () => new Response(html, { headers: { 'content-type': 'text/html' } })
		}
	);
	expect(result.facts.gameName).toBe('500 Rum');
	expect(result.facts.players).toEqual({ min: 2, max: 7 });
	expect(result.facts.scoring.rankOverrides['2']).toBeUndefined();
});

it('rejects a directory link with an actionable message', async () => {
	await expect(
		generateRulesetDraftFromInput(
			{ source: { type: 'url', url: 'https://bicyclecards.com/how-to-play' } },
			{
				fetchImpl: async () => new Response('<h1>Learn To Play</h1><p>Featured rules</p>')
			}
		)
	).rejects.toThrow(/specific game/i);
});

it('uses a disclosed reviewed snapshot when a supported source denies automated fetches', async () => {
	const result = await generateRulesetDraftFromInput(
		{ source: { type: 'url', url: 'https://bicyclecards.com/how-to-play/500-rum' } },
		{
			fetchImpl: async () => new Response('Access denied', { status: 403 })
		}
	);
	expect(result.facts.tableRules?.deal.byPlayerCount?.[2]).toBe(13);
	expect(result.diagnostics.join(' ')).toMatch(/reviewed.*2026-09-17/i);
	expect(result.diagnostics.join(' ')).toContain('403');
});
it('does not substitute unrelated rules when another source is blocked', async () => {
	await expect(
		generateRulesetDraftFromInput(
			{ source: { type: 'url', url: 'https://example.com/custom-rules' } },
			{
				fetchImpl: async () => new Response('Access denied', { status: 403 })
			}
		)
	).rejects.toThrow(/paste/i);
});
it('bounds downloaded source size before parsing an arbitrary rules page', async () => {
	await expect(
		generateRulesetDraftFromInput(
			{ source: { type: 'url', url: 'https://example.com/rules' } },
			{
				fetchImpl: async () => new Response('x'.repeat(2_000_001))
			}
		)
	).rejects.toThrow(/too large/i);
});

it('limits extracted prose before expensive rule matching', async () => {
	await expect(ingestSource({ type: 'text', text: 'x'.repeat(24001) })).rejects.toThrow(
		/maxSourceChars/
	);
});
