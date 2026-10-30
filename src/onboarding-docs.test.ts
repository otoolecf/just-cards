import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const guides = ['README.md', 'TODO.md', 'docs/deployment.md', 'docs/code-boundaries.md', 'docs/publication-review.md'];
const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;

describe('contributor guides', () => {
	it.each(guides)('%s has valid local links and npm commands', (file) => {
		expect(existsSync(file)).toBe(true);
		const content = readFileSync(file, 'utf8');
		for (const match of content.matchAll(/\]\((\.{1,2}\/[^)#]+)(?:#[^)]*)?\)/g)) {
			expect(existsSync(resolve(dirname(file), match[1])), `${file}: ${match[1]}`).toBe(true);
		}
		for (const match of content.matchAll(/npm run ([\w:-]+)/g)) {
			expect(scripts, `${file}: ${match[1]}`).toHaveProperty(match[1]);
		}
	});
});

describe('public documentation style', () => {
	it('omits authoring metadata, dated headings and one-off guide notes', async () => {
		const { readdirSync } = await import('node:fs');
		function markdownFiles(directory: string): string[] {
			return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
				const path = `${directory}/${entry.name}`;
				return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith('.md') ? [path] : [];
			});
		}
		const authoringNote = /^_(?:Status|Owner|Date|Last updated|Review date):|^#{1,6} .*\(\d{4}-\d{2}-\d{2}\)|First-pass guide|for this guide.s verification|^Verification:|^Verified locally/m;
		const files = ['README.md', 'TODO.md', 'AGENTS.md', ...markdownFiles('docs')];
		expect(files.filter((file) => authoringNote.test(readFileSync(file, 'utf8')))).toEqual([]);
	});
});
