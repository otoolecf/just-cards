import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { CreateRulesetInput, RulesetRecord, RuntimeRulesetBundle } from './types';

type RulesetStoreDriver = 'memory' | 'sqlite';

export interface CreateRulesetStoreOptions {
	driver?: RulesetStoreDriver;
	sqlitePath?: string;
}

export interface RulesetStore {
	create(input: CreateRulesetInput): Promise<RulesetRecord>;
	list(): Promise<RulesetRecord[]>;
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
			origin: input.origin,
			...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
			...(input.notes ? { notes: input.notes } : {}),
			bundle: structuredClone(input.bundle),
			createdAt: now,
			updatedAt: now
		};
		this.records.set(id, record);
		return cloneRecord(record);
	}

	async list(): Promise<RulesetRecord[]> {
		return [...this.records.values()]
			.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
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
		const DatabaseSyncCtor = sqliteModule.DatabaseSync as unknown as new (path: string) => SqliteDatabase;
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
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
				now
			);

		const created = await this.getById(id);
		if (!created) {
			throw new Error(`Failed to create ruleset "${id}"`);
		}
		return created;
	}

	async list(): Promise<RulesetRecord[]> {
		const rows = this.db
			.prepare(
				`SELECT id, name, origin, source_url, notes, bundle_json, created_at, updated_at
				 FROM rulesets
				 ORDER BY updated_at DESC`
			)
			.all();
		return rows.map(rowToRecord);
	}

	async getById(id: string): Promise<RulesetRecord | undefined> {
		const row = this.db
			.prepare(
				`SELECT id, name, origin, source_url, notes, bundle_json, created_at, updated_at
				 FROM rulesets
				 WHERE id = ?`
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
		throw new Error(`Stored ruleset "${String(row.id)}" has invalid bundle_json`);
	}

	return {
		id: String(row.id),
		name: String(row.name),
		origin: String(row.origin) as RulesetRecord['origin'],
		...(row.source_url ? { sourceUrl: String(row.source_url) } : {}),
		...(row.notes ? { notes: String(row.notes) } : {}),
		bundle,
		createdAt: String(row.created_at),
		updatedAt: String(row.updated_at)
	};
}

function defaultStoreDriver(): RulesetStoreDriver {
	const explicit = process.env.RULESET_STORE_DRIVER;
	if (explicit === 'memory' || explicit === 'sqlite') {
		return explicit;
	}
	if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
		return 'sqlite';
	}
	return 'memory';
}

function defaultSqlitePath(): string {
	return process.env.RULESET_SQLITE_PATH ?? '.local/rulesets.sqlite';
}

export async function createRulesetStore(options: CreateRulesetStoreOptions = {}): Promise<RulesetStore> {
	const driver = options.driver ?? defaultStoreDriver();
	if (driver === 'memory') {
		return new InMemoryRulesetStore();
	}

	const sqlitePath = options.sqlitePath ?? defaultSqlitePath();
	return SqliteRulesetStore.create(sqlitePath);
}
