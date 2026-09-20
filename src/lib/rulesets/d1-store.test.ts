import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createD1RulesetStore, type RulesetDatabase } from './d1-store';
import { familyRulesets } from './family-presets';

it('persists complete bundles through the D1 SQL contract across adapter instances', async () => {
	const sql = new DatabaseSync(':memory:');
	sql.exec(readFileSync('migrations/0001_rulesets.sql', 'utf8'));
	sql.exec(readFileSync('migrations/0002_ruleset_catalog.sql', 'utf8'));
	const db: RulesetDatabase = {
		prepare(query) {
			const statement = sql.prepare(query);
			return {
				async all<T>() {
					return { results: statement.all() as T[] };
				},
				bind(...values) {
					return {
						async first<T>() {
							return (statement.get(...values) ?? null) as T | null;
						},
						async run() {
							return statement.run(...values);
						},
					};
				},
			};
		},
	};
	const input = { ...familyRulesets()[0], id: 'imported-golf' };
	const record = await createD1RulesetStore(db).create(input);
	expect(await createD1RulesetStore(db).getById(record.id)).toEqual(record);
	expect(await createD1RulesetStore(db).list()).toEqual([record]);
	expect(await createD1RulesetStore(db).getById('absent')).toBeUndefined();
	await expect(createD1RulesetStore(db).create(input)).rejects.toThrow();
	expect((await createD1RulesetStore(db).getById(record.id))?.bundle).toEqual(
		input.bundle,
	);
	await expect(
		createD1RulesetStore(db).deleteArchived(record.id, record.updatedAt),
	).rejects.toThrow();
	const renamed = await createD1RulesetStore(db).updateMetadata(record.id, {
		name: 'Archived Golf',
		archived: true,
		expectedUpdatedAt: record.updatedAt,
	});
	expect((await createD1RulesetStore(db).getById(record.id))?.archived).toBe(
		true,
	);
	await expect(
		createD1RulesetStore(db).updateMetadata(record.id, {
			name: 'Lost update',
			archived: false,
			expectedUpdatedAt: record.updatedAt,
		}),
	).rejects.toThrow(/changed/);
	expect(renamed.bundle).toEqual(record.bundle);
	await expect(
		createD1RulesetStore(db).deleteArchived(record.id, record.updatedAt),
	).rejects.toThrow();
	await createD1RulesetStore(db).deleteArchived(record.id, renamed.updatedAt);
	expect(await createD1RulesetStore(db).getById(record.id)).toBeUndefined();
	expect(await createD1RulesetStore(db).list()).toEqual([]);
});
