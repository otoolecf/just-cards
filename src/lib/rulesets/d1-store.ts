import { metadataTimestamp, type RulesetStore } from './store';
import type { RulesetRecord } from './types';

/** The D1 operations this adapter uses; also executable against SQLite in tests. */
export interface RulesetDatabase {
	prepare(query: string): {
		all<T>(): Promise<{ results: T[] }>;
		bind(...values: (string | null)[]): {
			first<T>(): Promise<T | null>;
			run(): Promise<unknown>;
		};
	};
}
interface Row {
	archived: number;
	id: string;
	name: string;
	origin: RulesetRecord['origin'];
	source_url: string | null;
	notes: string | null;
	bundle_json: string;
	created_at: string;
	updated_at: string;
}
function decode(row: Row): RulesetRecord {
	return {
		id: row.id,
		archived: !!Number(row.archived),
		name: row.name,
		origin: row.origin,
		...(row.source_url ? { sourceUrl: row.source_url } : {}),
		...(row.notes ? { notes: row.notes } : {}),
		bundle: JSON.parse(row.bundle_json),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}
export function createD1RulesetStore(db: RulesetDatabase): RulesetStore {
	return {
		async create(input) {
			const now = new Date().toISOString();
			const record: RulesetRecord = {
				...structuredClone(input),
				archived: false,
				id: input.id ?? `ruleset-${crypto.randomUUID()}`,
				createdAt: now,
				updatedAt: now,
			};
			await db
				.prepare(
					`INSERT INTO rulesets
				(id,name,origin,source_url,notes,bundle_version,game_id,display_name,bundle_json,created_at,updated_at)
				VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
				)
				.bind(
					record.id,
					record.name,
					record.origin,
					record.sourceUrl ?? null,
					record.notes ?? null,
					record.bundle.bundleVersion,
					record.bundle.gameId,
					record.bundle.displayName,
					JSON.stringify(record.bundle),
					now,
					now,
				)
				.run();
			return record;
		},
		async updateMetadata(id, input) {
			const row = await db
				.prepare(
					'UPDATE rulesets SET name=?, archived=?, updated_at=? WHERE id=? AND updated_at=? RETURNING *',
				)
				.bind(
					input.name,
					input.archived ? '1' : '0',
					metadataTimestamp(input.expectedUpdatedAt),
					id,
					input.expectedUpdatedAt,
				)
				.first<Row>();
			if (!row)
				throw new Error('Ruleset changed or not found. Reload and try again.');
			return decode(row);
		},

		async deleteArchived(id, expectedUpdatedAt) {
			const deleted = await db
				.prepare(
					'DELETE FROM rulesets WHERE id=? AND archived=1 AND updated_at=? RETURNING id',
				)
				.bind(id, expectedUpdatedAt)
				.first<{ id: string }>();
			if (!deleted)
				throw new Error(
					'Game must be archived and unchanged. Reload and try again.',
				);
		},
		async list() {
			const { results } = await db
				.prepare('SELECT * FROM rulesets ORDER BY updated_at DESC, id')
				.all<Row>();
			return results.map(decode);
		},
		async getById(id) {
			const row = await db
				.prepare('SELECT * FROM rulesets WHERE id=?')
				.bind(id)
				.first<Row>();
			return row ? decode(row) : undefined;
		},
	};
}
