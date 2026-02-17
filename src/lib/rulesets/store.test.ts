import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createGameplayRulePack } from '$lib/gameplay/engine';
import { createRulePack } from '$lib/scorekeeper/engine';
import { createUiProfile, generateUiProfileFromRuntime } from '$lib/ui/ui-profile';
import { createRulesetService, type RuntimeRulesetBundle } from './service';
import { createRulesetStore } from './store';

function runtimeRulePack() {
	return {
		gameplayRulePack: createGameplayRulePack(),
		scoreRulePack: createRulePack(),
		scoringTriggers: []
	};
}

function validBundle(overrides: Partial<RuntimeRulesetBundle> = {}): RuntimeRulesetBundle {
	const pack = runtimeRulePack();
	return {
		bundleVersion: 'runtime-bundle/v1',
		gameId: 'six-card-golf',
		displayName: 'Six-Card Golf',
		runtimeRulePack: pack,
		uiProfile: generateUiProfileFromRuntime(pack),
		...overrides
	};
}

let tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
	tempDirs = [];
});

describe('ruleset store', () => {
	it('sqlite_ruleset_store_persists_records_across_instances', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'just-cards-rulesets-'));
		tempDirs.push(dir);
		const sqlitePath = join(dir, 'rulesets.sqlite');

		const storeA = await createRulesetStore({ driver: 'sqlite', sqlitePath });
		const record = await storeA.create({
			name: 'Golf Runtime',
			origin: 'manual',
			bundle: validBundle()
		});

		const storeB = await createRulesetStore({ driver: 'sqlite', sqlitePath });
		const fromSecondStore = await storeB.getById(record.id);

		expect(fromSecondStore?.id).toBe(record.id);
		expect(fromSecondStore?.bundle.gameId).toBe('six-card-golf');
		expect(fromSecondStore?.bundle.uiProfile.schemaVersion).toBe('ui-profile/v0');
	});

	it('ruleset_service_rejects_invalid_bundle_shape', async () => {
		const store = await createRulesetStore({ driver: 'memory' });
		const service = createRulesetService(store);

		await expect(
			service.createDraft({
				name: 'Bad Bundle',
				origin: 'manual',
				bundle: {
					bundleVersion: 'runtime-bundle/v1'
				}
			})
		).rejects.toThrow('runtimeRulePack');
	});

	it('ruleset_service_accepts_runtime_bundle_v1_with_ui_profile', async () => {
		const store = await createRulesetStore({ driver: 'memory' });
		const service = createRulesetService(store);

		const created = await service.createDraft({
			name: 'Cribbage Runtime',
			origin: 'llm',
			sourceUrl: 'https://example.com/cribbage-rules',
			bundle: validBundle({
				gameId: 'cribbage',
				displayName: 'Cribbage'
			})
		});
		const listed = await service.list();

		expect(created.bundle.gameId).toBe('cribbage');
		expect(created.bundle.uiProfile.table.zones.length).toBeGreaterThan(0);
		expect(listed).toHaveLength(1);
		expect(listed[0].id).toBe(created.id);
	});

	it('ruleset_service_generates_ui_profile_when_missing', async () => {
		const store = await createRulesetStore({ driver: 'memory' });
		const service = createRulesetService(store);
		const pack = runtimeRulePack();

		const created = await service.createDraft({
			name: 'Generated UI Profile',
			origin: 'llm',
			bundle: {
				bundleVersion: 'runtime-bundle/v1',
				gameId: 'generated-profile-game',
				displayName: 'Generated Profile Game',
				runtimeRulePack: pack
			}
		});

		expect(created.bundle.uiProfile.schemaVersion).toBe('ui-profile/v0');
		expect(created.bundle.uiProfile.hand.quickPlayTargets.length).toBeGreaterThan(0);
	});

	it('ruleset_service_rejects_ui_profile_runtime_zone_mismatch', async () => {
		const store = await createRulesetStore({ driver: 'memory' });
		const service = createRulesetService(store);
		const pack = {
			...runtimeRulePack(),
			gameplayRulePack: createGameplayRulePack({
				zoneMovePolicy: {
					targetZoneAllowlist: ['discard', 'hand']
				}
			})
		};

		await expect(
			service.createDraft({
				name: 'Mismatched UI profile',
				origin: 'manual',
				bundle: {
					bundleVersion: 'runtime-bundle/v1',
					gameId: 'mismatch',
					displayName: 'Mismatch',
					runtimeRulePack: pack,
					uiProfile: createUiProfile({
						table: {
							zones: [{ id: 'pot', label: 'Pot', hint: 'Shared pool' }]
						},
						hand: {
							label: 'Your Hand',
							hint: 'Choose card',
							quickPlayTargets: [{ zoneId: 'pot' }]
						}
					})
				}
			})
		).rejects.toThrow('quick_target_zone_not_playable');
	});
});
