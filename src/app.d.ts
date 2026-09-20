/// <reference path="../worker-configuration.d.ts" />
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform { env: Env }
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

declare module 'node:sqlite' {
	export class DatabaseSync {
		constructor(path: string);
		exec(sql: string): void;
		prepare(sql: string): {
			run(...params: unknown[]): unknown;
			get(...params: unknown[]): Record<string, unknown> | undefined;
			all(...params: unknown[]): Record<string, unknown>[];
		};
	}
}

export {};
