import { expect, it } from 'vitest';
import { createRulesetStore } from './store';
import { createRulesetService } from './service';
import { familyRulesets } from './family-presets';
import { catalogSelection, toggleFavorite } from './catalog';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
for (const driver of ['memory', 'sqlite'] as const)
	it(`${driver}: metadata is persistent and concurrent updates cannot overwrite changes`, async () => {
		const sqlitePath = join(
			mkdtempSync(join(tmpdir(), 'jc-catalog-')),
			'db.sqlite',
		);
		const store = await createRulesetStore({ driver, sqlitePath }),
			service = createRulesetService(store);
		const original = await service.createDraft(familyRulesets()[0]);
		const renamed = await service.updateMetadata(original.id, {
			name: 'Family Golf',
			archived: false,
			expectedUpdatedAt: original.updatedAt,
		});
		expect(renamed.name).toBe('Family Golf');
		expect(renamed.bundle).toEqual(original.bundle);
		await expect(
			service.updateMetadata(original.id, {
				name: 'Stale',
				archived: false,
				expectedUpdatedAt: original.updatedAt,
			}),
		).rejects.toThrow(/changed|conflict/i);
		const archived = await service.updateMetadata(original.id, {
			name: renamed.name,
			archived: true,
			expectedUpdatedAt: renamed.updatedAt,
		});
		expect(archived.archived).toBe(true);
		const reopened =
			driver === 'sqlite'
				? await createRulesetStore({ driver, sqlitePath })
				: store;
		expect((await reopened.getById(original.id))?.archived).toBe(true);
		const restored = await service.updateMetadata(original.id, {
			name: renamed.name,
			archived: false,
			expectedUpdatedAt: archived.updatedAt,
		});
		expect(restored.archived).toBe(false);
	});
it('favorites order active selections and never put archived items back in pickers', () => {
	const records = familyRulesets();
	records[0].archived = true;
	const favorites = toggleFavorite([], records[1].id);
	expect(catalogSelection(records, favorites).map((r) => r.id)).toEqual([
		...records.slice(1).map(r=>r.id),
	]);
	expect(toggleFavorite(favorites, records[1].id)).toEqual([]);
});
