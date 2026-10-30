export const PATTERN_WORK_LIMIT = 10_000;
export const SCORING_REPLAY_WORK_LIMIT = 100_000;

/** Execution state only: never read a budget from user-supplied match options. */
export class PatternWorkBudget {
	constructor(
		private remaining = PATTERN_WORK_LIMIT,
		private readonly parent?: PatternWorkBudget
	) {}

	consume(units = 1): void {
		if (units > this.remaining) {
			this.remaining = 0;
			throw new Error(
				'This scoring pattern or session is too complex (pattern work budget exceeded)'
			);
		}
		this.parent?.consume(units);
		this.remaining -= units;
	}
}

/** Fast estimate only; actual enumeration must also consume a runtime budget. */
export function assertPatternBudget(
	cards: { rank: string; suit?: string }[],
	pack: unknown,
	work?: PatternWorkBudget
): void {
	const fail = () => {
		throw new Error('Pattern work budget exceeded');
	};
	if (!Array.isArray(cards) || cards.length > 52) fail();
	let nodes = 0;
	const budget = 10000;
	const bound = (m: any, depth = 0): number => {
		work?.consume(1 + cards.length);
		if (++nodes > 32 || depth > 8) return fail();
		if (!m || typeof m !== 'object') return 0;
		if (m.kind === 'all' || m.kind === 'any') {
			if (!Array.isArray(m.matches)) return 0;
			let count = m.kind === 'all' ? 1 : 0;
			for (const child of m.matches) {
				const n = bound(child, depth + 1);
				count = m.kind === 'all' ? count * n : count + n;
				if (count > budget) fail();
			}
			return count;
		}
		if (m.kind === 'all_same_rank' || m.kind === 'all_same_suit') {
			const groups = new Map<string, number>();
			for (const c of cards) {
				const key = m.kind === 'all_same_rank' ? c.rank : (c.suit ?? '');
				groups.set(key, (groups.get(key) ?? 0) + 1);
			}
			let total = 0;
			for (const n of groups.values()) {
				let choose = 1;
				for (let k = 1; k <= n; k++) {
					choose = (choose * (n - k + 1)) / k;
					if (k >= (m.minCards ?? 1) && k <= (m.maxCards ?? n)) total += choose;
					if (total > budget) fail();
				}
			}
			return total;
		}
		if (m.kind === 'run') {
			const groups = new Map<string, number>();
			for (const c of cards) groups.set(c.rank, (groups.get(c.rank) ?? 0) + 1);
			let count = cards.length * cards.length;
			for (const n of groups.values()) {
				count *= n;
				if (count > budget) fail();
			}
			return count;
		}
		return 1;
	};
	let total = 0;
	const patterns = (pack as { patterns?: unknown[] })?.patterns;
	if (Array.isArray(patterns))
		for (const p of patterns) {
			total += bound((p as { match?: unknown })?.match);
			if (total > budget) fail();
		}
}
