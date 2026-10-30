import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
	CreateRulesetInput,
	RulesetRecord,
	RuntimeRulesetBundle,
} from './types';

type RulesetStoreDriver = 'memory' | 'sqlite';

export interface CreateRulesetStoreOptions {
	driver?: RulesetStoreDriver;
	sqlitePath?: string;
}

export interface RulesetMetadataUpdate {
	name: string;
	archived: boolean;
	expectedUpdatedAt: string;
}
export function metadataTimestamp(previous: string): string {
	return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
}
export interface RulesetStore {
	deleteArchived(id: string, expectedUpdatedAt: string): Promise<void>;
	updateMetadata(
		id: string,
		input: RulesetMetadataUpdate,
	): Promise<RulesetRecord>;
	create(input: CreateRulesetInput): Promise<RulesetRecord>;
	list(limit?: number, offset?: number): Promise<RulesetRecord[]>;
	getById(id: string): Promise<RulesetRecord | undefined>;
}

interface SqliteStatement {
	get(...params: unknown[]): Record<string, unknown> | undefined;
	all(...params: unknown[]): Record<string, unknown>[];
	run(...params: unknown[]): unknown;
}

interface SqliteDatabase {
	exec(sql: string): void;
	prepare(sql: string): SqliteStatement;
}

class InMemoryRulesetStore implements RulesetStore {
	private readonly records = new Map<string, RulesetRecord>();

	async create(input: CreateRulesetInput): Promise<RulesetRecord> {
		const id = input.id ?? randomRulesetId();
		if (this.records.has(id)) {
			throw new Error(`Ruleset "${id}" already exists`);
		}

		const now = nowIso();
		const record: RulesetRecord = {
			id,
			name: input.name,
			archived: false,
			origin: input.origin,
			...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
			...(input.notes ? { notes: input.notes } : {}),
			bundle: structuredClone(input.bundle),
			createdAt: now,
			updatedAt: now,
		};
		this.records.set(id, record);
		return cloneRecord(record);
	}

	async updateMetadata(
		id: string,
		input: RulesetMetadataUpdate,
	): Promise<RulesetRecord> {
		const record = this.records.get(id);
		if (!record) throw new Error('Ruleset not found');
		if (record.updatedAt !== input.expectedUpdatedAt)
			throw new Error('Ruleset changed. Reload and try again.');
		const next = {
			...record,
			name: input.name,
			archived: input.archived,
			updatedAt: metadataTimestamp(record.updatedAt),
		};
		this.records.set(id, next);
		return cloneRecord(next);
	}
	async deleteArchived(id: string, expectedUpdatedAt: string): Promise<void> {
		const record = this.records.get(id);
		if (!record?.archived || record.updatedAt !== expectedUpdatedAt)
			throw new Error(
				'Game must be archived and unchanged. Reload and try again.',
			);
		this.records.delete(id);
	}

	async list(limit = 100, offset = 0): Promise<RulesetRecord[]> {
		return [...this.records.values()]
			.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
			.slice(offset, offset + Math.min(100, Math.max(1, limit)))
			.map(cloneRecord);
	}

	async getById(id: string): Promise<RulesetRecord | undefined> {
		const record = this.records.get(id);
		return record ? cloneRecord(record) : undefined;
	}
}

class SqliteRulesetStore implements RulesetStore {
	private readonly db: SqliteDatabase;

	private constructor(db: SqliteDatabase) {
		this.db = db;
	}

	static async create(sqlitePath: string): Promise<SqliteRulesetStore> {
		const resolvedPath = resolve(sqlitePath);
		mkdirSync(dirname(resolvedPath), { recursive: true });

		const sqliteModule = await import('node:sqlite');
		const DatabaseSyncCtor = sqliteModule.DatabaseSync as unknown as new (
			path: string,
		) => SqliteDatabase;
		const db = new DatabaseSyncCtor(resolvedPath);

		db.exec(`
			CREATE TABLE IF NOT EXISTS rulesets (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				origin TEXT NOT NULL,
				source_url TEXT,
				notes TEXT,
				bundle_version TEXT NOT NULL,
				game_id TEXT NOT NULL,
				display_name TEXT NOT NULL,
				bundle_json TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_rulesets_updated_at ON rulesets(updated_at DESC);
		`);

		if (
			!db
				.prepare('PRAGMA table_info(rulesets)')
				.all()
				.some((column) => column.name === 'archived')
		)
			db.exec(
				'ALTER TABLE rulesets ADD COLUMN archived INTEGER NOT NULL DEFAULT 0',
			);
		return new SqliteRulesetStore(db);
	}

	async create(input: CreateRulesetInput): Promise<RulesetRecord> {
		const id = input.id ?? randomRulesetId();
		const existing = await this.getById(id);
		if (existing) {
			throw new Error(`Ruleset "${id}" already exists`);
		}

		const now = nowIso();
		this.db
			.prepare(
				`INSERT INTO rulesets (
					id, name, origin, source_url, notes,
					bundle_version, game_id, display_name, bundle_json,
					created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				id,
				input.name,
				input.origin,
				input.sourceUrl ?? null,
				input.notes ?? null,
				input.bundle.bundleVersion,
				input.bundle.gameId,
				input.bundle.displayName,
				JSON.stringify(input.bundle),
				now,
				now,
			);

		const created = await this.getById(id);
		if (!created) {
			throw new Error(`Failed to create ruleset "${id}"`);
		}
		return created;
	}

	async updateMetadata(
		id: string,
		input: RulesetMetadataUpdate,
	): Promise<RulesetRecord> {
		const row = this.db
			.prepare(
				'UPDATE rulesets SET name=?, archived=?, updated_at=? WHERE id=? AND updated_at=? RETURNING *',
			)
			.get(
				input.name,
				input.archived ? 1 : 0,
				metadataTimestamp(input.expectedUpdatedAt),
				id,
				input.expectedUpdatedAt,
			);
		if (!row)
			throw new Error('Ruleset changed or not found. Reload and try again.');
		return rowToRecord(row);
	}
	async deleteArchived(id: string, expectedUpdatedAt: string): Promise<void> {
		const deleted = this.db
			.prepare(
				'DELETE FROM rulesets WHERE id=? AND archived=1 AND updated_at=? RETURNING id',
			)
			.get(id, expectedUpdatedAt);
		if (!deleted)
			throw new Error(
				'Game must be archived and unchanged. Reload and try again.',
			);
	}

	async list(limit = 100, offset = 0): Promise<RulesetRecord[]> {
		const rows = this.db
			.prepare(
				`SELECT id, name, origin, source_url, notes, bundle_json, created_at, updated_at, archived
				 FROM rulesets
				 ORDER BY updated_at DESC, id LIMIT ? OFFSET ?`,
			)
			.all(Math.min(100, Math.max(1, Math.trunc(limit))), Math.max(0, Math.trunc(offset)));
		return rows.map(rowToRecord);
	}

	async getById(id: string): Promise<RulesetRecord | undefined> {
		const row = this.db
			.prepare(
				`SELECT id, name, origin, source_url, notes, bundle_json, created_at, updated_at, archived
				 FROM rulesets
				 WHERE id = ?`,
			)
			.get(id);
		return row ? rowToRecord(row) : undefined;
	}
}

function nowIso(): string {
	return new Date().toISOString();
}

function randomRulesetId(): string {
	return `ruleset-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function cloneRecord(record: RulesetRecord): RulesetRecord {
	return structuredClone(record);
}

function rowToRecord(row: Record<string, unknown>): RulesetRecord {
	let bundle: RuntimeRulesetBundle;
	try {
		bundle = JSON.parse(String(row.bundle_json)) as RuntimeRulesetBundle;
	} catch {
		throw new Error(
			`Stored ruleset "${String(row.id)}" has invalid bundle_json`,
		);
	}

	return {
		id: String(row.id),
		archived: !!Number(row.archived),
		name: String(row.name),
		origin: String(row.origin) as RulesetRecord['origin'],
		...(row.source_url ? { sourceUrl: String(row.source_url) } : {}),
		...(row.notes ? { notes: String(row.notes) } : {}),
		bundle,
		createdAt: String(row.created_at),
		updatedAt: String(row.updated_at),
	};
}

function defaultStoreDriver(): RulesetStoreDriver {
	const explicit = process.env.RULESET_STORE_DRIVER;
	if (explicit === 'memory' || explicit === 'sqlite') {
		return explicit;
	}
	if (
		process.env.NODE_ENV === 'development' ||
		process.env.NODE_ENV === 'test'
	) {
		return 'sqlite';
	}
	return 'memory';
}

function defaultSqlitePath(): string {
	return process.env.RULESET_SQLITE_PATH ?? '.local/rulesets.sqlite';
}

export async function createRulesetStore(
	options: CreateRulesetStoreOptions = {},
): Promise<RulesetStore> {
	const driver = options.driver ?? defaultStoreDriver();
	if (driver === 'memory') {
		return new InMemoryRulesetStore();
	}

	const sqlitePath = options.sqlitePath ?? defaultSqlitePath();
	return SqliteRulesetStore.create(sqlitePath);
}
