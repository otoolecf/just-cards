import type { GameEvent } from '$lib/gameplay/engine';
import type { McpGameSessionSnapshot } from './types';

export interface McpGameStore {
	create(input: {
		gameId?: string;
		rulesetId: string;
		players: string[];
		events: GameEvent[];
	}): Promise<McpGameSessionSnapshot>;
	getById(gameId: string): Promise<McpGameSessionSnapshot | undefined>;
	list(): Promise<McpGameSessionSnapshot[]>;
	setEvents(gameId: string, events: GameEvent[]): Promise<McpGameSessionSnapshot>;
}

function nowIso(): string {
	return new Date().toISOString();
}

function randomGameId(): string {
	return `game-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

function cloneSnapshot(snapshot: McpGameSessionSnapshot): McpGameSessionSnapshot {
	return structuredClone(snapshot);
}

export class InMemoryMcpGameStore implements McpGameStore {
	private readonly snapshots = new Map<string, McpGameSessionSnapshot>();

	async create(input: {
		gameId?: string;
		rulesetId: string;
		players: string[];
		events: GameEvent[];
	}): Promise<McpGameSessionSnapshot> {
		const gameId = input.gameId?.trim() || randomGameId();
		if (this.snapshots.has(gameId)) {
			throw new Error(`Game "${gameId}" already exists`);
		}
		const now = nowIso();
		const snapshot: McpGameSessionSnapshot = {
			gameId,
			rulesetId: input.rulesetId,
			players: [...input.players],
			events: structuredClone(input.events),
			createdAt: now,
			updatedAt: now
		};
		this.snapshots.set(gameId, snapshot);
		return cloneSnapshot(snapshot);
	}

	async getById(gameId: string): Promise<McpGameSessionSnapshot | undefined> {
		const snapshot = this.snapshots.get(gameId);
		return snapshot ? cloneSnapshot(snapshot) : undefined;
	}

	async list(): Promise<McpGameSessionSnapshot[]> {
		return [...this.snapshots.values()]
			.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
			.map(cloneSnapshot);
	}

	async setEvents(gameId: string, events: GameEvent[]): Promise<McpGameSessionSnapshot> {
		const snapshot = this.snapshots.get(gameId);
		if (!snapshot) {
			throw new Error(`Game "${gameId}" not found`);
		}

		const updated: McpGameSessionSnapshot = {
			...snapshot,
			events: structuredClone(events),
			updatedAt: nowIso()
		};
		this.snapshots.set(gameId, updated);
		return cloneSnapshot(updated);
	}
}
