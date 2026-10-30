import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DESIGN_COLOR_TOKENS } from './design-primitives';

function dimensions(file: string) {
	const data = readFileSync(file);
	expect(data.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
	return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

describe('application icons', () => {
	it('uses the same square card favicon in bundled and static entry points', () => {
		const svg = readFileSync('static/favicon.svg', 'utf8');
		expect(svg).toBe(readFileSync('src/lib/assets/favicon.svg', 'utf8'));
		expect(svg).toContain('<title>Just Cards</title>');
		expect(svg).toContain('viewBox="0 0 64 64"');
		expect(svg).not.toMatch(/svelte|<text\b|<image\b/i);
		const palette = Object.values(DESIGN_COLOR_TOKENS);
		for (const color of svg.matchAll(/#[0-9a-f]{6}/gi)) expect(palette).toContain(color[0]);
	});
	it('provides correctly sized PNGs for touch and app launcher icons', () => {
		expect(dimensions('static/apple-touch-icon.png')).toEqual([180, 180]);
		const layout = readFileSync('src/routes/+layout.svelte', 'utf8');
		expect(layout).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"');
		const manifest = JSON.parse(readFileSync('static/manifest.webmanifest', 'utf8'));
		for (const size of [192, 512]) {
			const icon = manifest.icons.find((item: { sizes: string; type: string }) => item.sizes === `${size}x${size}` && item.type === 'image/png');
			expect(icon).toBeDefined();
			expect(dimensions(`static${icon.src}`)).toEqual([size, size]);
		}
	});
});
