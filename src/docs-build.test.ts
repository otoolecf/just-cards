import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('documentation build', () => {
	it('renders deployment links from configuration without changing source docs', () => {
		const directory = mkdtempSync(join(tmpdir(), 'just-cards-docs-'));
		const source = readFileSync('docs/public-rooms.md', 'utf8');
		try {
			for (const url of ['https://cards.example', 'https://other.example/cards/']) {
				execFileSync(process.execPath, ['scripts/build-docs.mjs', directory], {
					env: { ...process.env, PUBLIC_APP_URL: url },
				});
				const rendered = readFileSync(join(directory, 'public-rooms.md'), 'utf8');
				expect(rendered).toContain(`[Hosted app](${url})`);
				expect(rendered).not.toContain('{{PUBLIC_APP_URL}}');
				expect(existsSync(join(directory, 'specs/README.md'))).toBe(true);
				for (const retired of ['publication-review.md', 'publication-results-2026-10-30.md', 'security-audit-2026-10-30.md']) {
					expect(existsSync(join(directory, retired))).toBe(false);
				}
				expect(readFileSync(join(directory, 'security-deployment.md'), 'utf8')).toContain('## MCP limitations');
			}
			expect(readFileSync('docs/public-rooms.md', 'utf8')).toBe(source);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it.each(['', 'javascript:alert(1)', 'https://user:password@cards.example', 'https://cards.example/a)b'])('rejects invalid deployment URL %j before writing output', (url) => {
		const directory = mkdtempSync(join(tmpdir(), 'just-cards-docs-'));
		const output = resolve(directory, 'output');
		try {
			const result = spawnSync(process.execPath, ['scripts/build-docs.mjs', output], {
				env: { ...process.env, PUBLIC_APP_URL: url }, encoding: 'utf8',
			});
			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain('PUBLIC_APP_URL');
			expect(existsSync(output)).toBe(false);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
