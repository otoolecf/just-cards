import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function scorePageSource(): string {
	return readFileSync(resolve(process.cwd(), 'src/routes/+page.svelte'), 'utf8');
}

describe('score page contract', () => {
	it('score_page_includes_variant_add_round_modes', () => {
		const source = scorePageSource();
		expect(source).toContain('Manual points');
		expect(source).toContain('500 Rummy net');
		expect(source).toContain('Six Card Golf hole');
	});

	it('score_page_marks_ruleset_tools_as_optional', () => {
		const source = scorePageSource();
		expect(source).toContain('Ruleset tools (optional)');
	});

	it('score_page_uses_mode_driven_standings_sort', () => {
		const source = scorePageSource();
		expect(source).toContain('sortStandingsByMode');
	});
});
