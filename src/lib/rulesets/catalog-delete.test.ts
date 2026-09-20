import { expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRulesetStore } from './store';
import { createRulesetService } from './service';
import { familyRulesets } from './family-presets';
import { createRoom, viewRoom } from '../server/room-service';
import { reconcileCatalog } from './catalog';
for (const driver of ['memory', 'sqlite'] as const)
	it(`${driver}: deletes only the archived revision and preserves independent snapshots`, async () => {
		const store = await createRulesetStore({
			driver,
			sqlitePath: join(mkdtempSync(join(tmpdir(), 'jc-delete-')), 'db.sqlite'),
		});
		const service = createRulesetService(store);
		const original = await service.createDraft(familyRulesets()[0]);
		const room = createRoom('ROOM1234', 'Host', 'hash', original.bundle);
		await expect(
			service.deleteArchived(original.id, original.updatedAt),
		).rejects.toThrow();
		const archived = await service.updateMetadata(original.id, {
			name: 'Renamed',
			archived: true,
			expectedUpdatedAt: original.updatedAt,
		});
		expect(archived.id).toBe(original.id);
		await expect(
			service.deleteArchived(original.id, original.updatedAt),
		).rejects.toThrow();
		const restored = await service.updateMetadata(original.id, {
			name: archived.name,
			archived: false,
			expectedUpdatedAt: archived.updatedAt,
		});
		await expect(
			service.deleteArchived(original.id, archived.updatedAt),
		).rejects.toThrow();
		await expect(
			service.deleteArchived(original.id, restored.updatedAt),
		).rejects.toThrow();
		const final = await service.updateMetadata(original.id, {
			name: restored.name,
			archived: true,
			expectedUpdatedAt: restored.updatedAt,
		});
		await service.deleteArchived(original.id, final.updatedAt);
		expect(await store.getById(original.id)).toBeUndefined();
		expect(await store.list()).toEqual([]);
		expect(viewRoom(room, 'hash').name).toBe(original.bundle.displayName);
		await expect(
			service.deleteArchived('builtin-six-card-golf', final.updatedAt),
		).rejects.toThrow(/built-in/i);
	});
it('drops deleted cached entries on successful online load while retaining offline access', () => {
	const cached = familyRulesets();
	expect(reconcileCatalog([cached[0]], cached, true)).toEqual([cached[0]]);
	expect(reconcileCatalog([], cached, false)).toEqual(cached);
});
