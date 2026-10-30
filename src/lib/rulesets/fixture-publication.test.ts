import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const directory = new URL('./evals/fixtures/', import.meta.url);
describe('publishable rule extraction fixtures', () => {
 for (const name of readdirSync(directory).filter((name) => name.endsWith('.html'))) {
  it(`${name} is original synthetic test input without publisher page extras`, () => {
   const html = readFileSync(new URL(name, directory), 'utf8');
   expect(html).toContain('data-fixture="synthetic"');
   expect(Buffer.byteLength(html)).toBeLessThan(2000);
   expect(html).not.toMatch(/<script\b|mailto:|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  });
 }
});
