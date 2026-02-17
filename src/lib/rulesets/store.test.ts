import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createGameplayRulePack } from '$lib/gameplay/engine';
import { createRulePack } from '$lib/scorekeeper/engine';
import { createRulesetService, type RuntimeRulesetBundle } from './service';
import { createRulesetStore } from './store';

function validBundle(overrides: Partial<RuntimeRulesetBundle> = {}): RuntimeRulesetBundle {
	return {
		bundleVersion: 'runtime-bundle/v0',
		gameId: 'six-card-golf',
		displayName: 'Six-Card Golf',
		runtimeRulePack: {
			gameplayRulePack: createGameplayRulePack(),
			scoreRulePack: createRulePack(),
			scoringTriggers: []
		},
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
	});

	it('ruleset_service_rejects_invalid_bundle_shape', async () => {
		const store = await createRulesetStore({ driver: 'memory' });
		const service = createRulesetService(store);

		await expect(
			service.createDraft({
				name: 'Bad Bundle',
				origin: 'manual',
				bundle: {
					bundleVersion: 'runtime-bundle/v0'
				}
			})
		).rejects.toThrow('runtimeRulePack');
	});

	it('ruleset_service_accepts_valid_runtime_bundle_and_stores_record', async () => {
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
		expect(listed).toHaveLength(1);
		expect(listed[0].id).toBe(created.id);
	});
});
