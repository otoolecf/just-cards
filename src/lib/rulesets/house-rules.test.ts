import { expect, it } from 'vitest';
import { familyRulesets } from './family-presets';
import { houseRuleSettings, createHouseRules } from './house-rules';
import { canPlayRuleset, validateGenerationReport } from './generation-report';
import { deriveGuidedScoreProfileFromBundle } from '../session/score-session-commands';

it('saves a named ten-card hand variant with fresh validation and matching guidance', () => {
	const parent = familyRulesets().find(
		(r) => r.bundle.runtimeRulePack.tableRules?.meld,
	)!;
	const before = JSON.stringify(parent);
	const settings = houseRuleSettings(parent.bundle);
	settings.cardsPerPlayer = 10;
	settings.twoPlayerCards = 10;
	settings.maxPlayers = 5;
	settings.target = 250;
	settings.cardValues.A = 5;
	const b = createHouseRules(parent, 'Our ten-card Rummy', settings);
	expect(b.runtimeRulePack.tableRules?.deal).toEqual({
		cardsPerPlayer: 10,
		byPlayerCount: { '2': 10 },
	});
	expect(b.runtimeRulePack.tableRules?.scoring.target).toBe(250);
	expect(b.explain?.setup?.cardsPerPlayer).toBe(10);
	expect(canPlayRuleset(b)).toBe(true);
	expect(() => validateGenerationReport(b.generationReport, b)).not.toThrow();
	expect(b.houseRules?.parentId).toBe(parent.id);
	expect(JSON.stringify(parent)).toBe(before);
	expect(
		deriveGuidedScoreProfileFromBundle(b, 'custom').scoreRulePack.baseAceValue,
	).toBe(5);
});
it('changes Golf length, reveals, values and column cancellation through primitives', () => {
	const parent = familyRulesets().find(
		(r) => r.bundle.runtimeRulePack.tableRules?.layout,
	)!;
	const settings = houseRuleSettings(parent.bundle);
	settings.rounds = 3;
	settings.initialReveals = 1;
	settings.cancelPairs = false;
	settings.cardValues.K = -1;
	const b = createHouseRules(parent, 'Short Golf', settings);
	expect(b.runtimeRulePack.tableRules?.scoring.rounds).toBe(3);
	expect(b.runtimeRulePack.tableRules?.layout?.initialReveals).toBe(1);
	expect(b.runtimeRulePack.tableRules?.scoring.columnPairs).toBeUndefined();
	expect(canPlayRuleset(b)).toBe(true);
});
it('rejects impossible deals, invalid settings and unreviewed source drafts', () => {
	const parent = familyRulesets().find(
		(r) => r.bundle.runtimeRulePack.tableRules?.meld,
	)!;
	const settings = houseRuleSettings(parent.bundle);
	settings.cardsPerPlayer = 25;
	expect(() => createHouseRules(parent, 'Too many', settings)).toThrow(
		/deck|capacity/i,
	);
	expect(() =>
		createHouseRules(parent, '', houseRuleSettings(parent.bundle)),
	).toThrow(/name/i);
	parent.bundle.generationReport = { status: 'blocked' } as never;
	expect(() =>
		createHouseRules(parent, 'Bypass', houseRuleSettings(parent.bundle)),
	).toThrow(/review|ready/i);
});
it('persists family provenance and rejects a stale base through the API', async () => {
	const { getDefaultRulesetService, resetDefaultRulesetServiceForTests } =
		await import('./default-service');
	const { POST } = await import(
		'../../routes/api/rulesets/[rulesetId]/house-rules/+server'
	);
	const { policySnapshot } = await import('./generation-report');
	process.env.RULESET_STORE_DRIVER = 'memory';
	resetDefaultRulesetServiceForTests();
	const parent = familyRulesets()[0],
		settings = houseRuleSettings(parent.bundle);
	const request = (snapshot: string) =>
		POST({
			params: { rulesetId: parent.id },
			request: new Request('http://localhost/house-rules', {
				method: 'POST',
				body: JSON.stringify({
					name: 'Family variant',
					settings,
					policySnapshot: snapshot,
				}),
			}),
		} as Parameters<typeof POST>[0]);
	expect((await request('stale')).status).toBe(409);
	const response = await request(policySnapshot(parent.bundle));
	expect(response.status).toBe(200);
	const { ruleset } = (await response.json()) as { ruleset: typeof parent };
	const persisted = await (
		await getDefaultRulesetService()
	).getById(ruleset.id);
	expect(persisted?.bundle.houseRules?.parentId).toBe(parent.id);
	expect(canPlayRuleset(persisted!.bundle)).toBe(true);
});

it('bounds editable points to the shared executable extraction contract', () => {
 const parent=familyRulesets()[0],settings=houseRuleSettings(parent.bundle);
 settings.cardValues.A=1.5;
 expect(()=>createHouseRules(parent,'Half points',settings)).toThrow(/whole numbers/);
 settings.cardValues.A=101;
 expect(()=>createHouseRules(parent,'Too large',settings)).toThrow(/-100 to 100/);
});
