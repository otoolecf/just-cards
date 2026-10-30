import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('checkout portability', () => {
	it('keeps tracked documentation and scripts independent of user home directories', () => {
		const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
			.split('\0')
			.filter((file) => file.endsWith('.md') || file.startsWith('scripts/'));
		const userHomePath = /\/(?:Users|home)\/[^/\s]+\//;
		const nonportable = files.filter((file) => userHomePath.test(readFileSync(file, 'utf8')));

		expect(nonportable).toEqual([]);
	});
});
