import type { McpToolName } from './types';

export type McpAuditStatus = 'ok' | 'error';

export interface McpAuditEntry {
	id: string;
	ts: string;
	traceId: string;
	tool: McpToolName;
	status: McpAuditStatus;
	durationMs: number;
	details?: string;
}

export interface McpAuditLog {
	append(input: Omit<McpAuditEntry, 'id' | 'ts'>): void;
	list(limit?: number): McpAuditEntry[];
	clear(): void;
}

export interface InMemoryMcpAuditLogOptions {
	maxEntries?: number;
}

function randomEntryId(): string {
	return `audit-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export class InMemoryMcpAuditLog implements McpAuditLog {
	private readonly maxEntries: number;
	private readonly entries: McpAuditEntry[] = [];

	constructor(options: InMemoryMcpAuditLogOptions = {}) {
		this.maxEntries = Math.max(1, options.maxEntries ?? 500);
	}

	append(input: Omit<McpAuditEntry, 'id' | 'ts'>): void {
		this.entries.unshift({
			id: randomEntryId(),
			ts: new Date().toISOString(),
			...input
		});
		if (this.entries.length > this.maxEntries) {
			this.entries.length = this.maxEntries;
		}
	}

	list(limit?: number): McpAuditEntry[] {
		const max = typeof limit === 'number' && Number.isInteger(limit) ? Math.max(1, limit) : this.maxEntries;
		return this.entries.slice(0, max).map((entry) => ({ ...entry }));
	}

	clear(): void {
		this.entries.length = 0;
	}
}
