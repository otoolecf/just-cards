import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function markdownFiles(directory: string): string[] {
 return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = `${directory}/${entry.name}`;
  return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith('.md') ? [path] : [];
 });
}
const guides = ['README.md', 'TODO.md', 'SECURITY.md', 'CONTRIBUTING.md', 'AGENTS.md', ...markdownFiles('docs')];
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
	it('omits authoring metadata, dated headings and one-off guide notes', () => {
		const authoringNote = /^_(?:Status|Owner|Date|Last updated|Review date):|^#{1,6} .*\(\d{4}-\d{2}-\d{2}\)|First-pass guide|for this guide.s verification|^Verification:|^Verified locally/m;
		const files = guides;
		expect(files.filter((file) => authoringNote.test(readFileSync(file, 'utf8')))).toEqual([]);
	});
});


describe('maintained contributor documentation', () => {
 it('retires launch reports from the current documentation tree', () => {
  const retired = ['docs/publication-review.md', 'docs/publication-results-2026-10-30.md', 'docs/security-audit-2026-10-30.md'];
  expect(retired.filter((file) => existsSync(file))).toEqual([]);
 });
 it('preserves current MCP and operational limitations', () => {
  const integration = readFileSync('docs/chatgpt-mcp-roadmap-v0.md', 'utf8');
  expect(integration).toContain('## Implemented');
  expect(integration).toContain('## Planned');
  expect(integration).toContain('prototype');
  const operations = readFileSync('docs/security-deployment.md', 'utf8');
  expect(operations).toContain('Widget HTML');
  expect(operations).toContain('JSON-RPC batch');
  expect(operations).toContain('source-fetch destination');
  expect(operations).toContain('automatic record retention');
 });
});


describe('developer first impressions', () => {
 it('shows the live demo, product screenshot and built-in games before setup', () => {
  const readme=readFileSync('README.md','utf8');
  const intro=readme.split('## Clone and run locally')[0];
  expect(intro).toContain('https://justcards.app');
  expect(intro).toMatch(/!\[[^\]]+\]\(\.\/docs\/images\/[^)]+\)/);
  for (const game of ['Six Card Golf','500 Rum','Solitaire','Bridge','Palace','Hong Kong Mahjong']) expect(intro).toContain(game);
  expect(readme).toContain('./CONTRIBUTING.md');
 });
 it('describes current storage in the agent contribution contract', () => {
  const agents=readFileSync('AGENTS.md','utf8');
  expect(agents).not.toContain('Pre-Cloudflare');
  expect(agents).not.toContain('until Cloudflare storage adapters are wired');
  expect(agents).toContain('Durable Object SQLite');
  expect(agents).toContain('not required');
 });
});
