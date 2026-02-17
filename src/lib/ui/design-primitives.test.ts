import { describe, expect, test } from 'vitest';
import {
	ACCENT_CONTRAST_PAIRS,
	DESIGN_COLOR_TOKENS,
	DESIGN_MOTION_TOKENS,
	DESIGN_TYPOGRAPHY_TOKENS,
	TEXT_CONTRAST_PAIRS,
	contrastRatio,
	resolveToken
} from '$lib/ui/design-primitives';

describe('design-primitives', () => {
	test('contrast_ratio_is_symmetric', () => {
		const ratioAB = contrastRatio('#112233', '#f0f4ff');
		const ratioBA = contrastRatio('#f0f4ff', '#112233');
		expect(ratioAB).toBeCloseTo(ratioBA, 8);
	});

	test('ui_text_pairs_meet_wcag_aa', () => {
		for (const pair of TEXT_CONTRAST_PAIRS) {
			const fg = resolveToken(DESIGN_COLOR_TOKENS, pair.fg);
			const bg = resolveToken(DESIGN_COLOR_TOKENS, pair.bg);
			const ratio = contrastRatio(fg, bg);
			expect(ratio, `${pair.fg} on ${pair.bg} ratio ${ratio.toFixed(2)} should be >= 4.5`).toBeGreaterThanOrEqual(4.5);
		}
	});

	test('ui_accent_pairs_meet_minimum_threshold', () => {
		for (const pair of ACCENT_CONTRAST_PAIRS) {
			const fg = resolveToken(DESIGN_COLOR_TOKENS, pair.fg);
			const bg = resolveToken(DESIGN_COLOR_TOKENS, pair.bg);
			const ratio = contrastRatio(fg, bg);
			expect(ratio, `${pair.fg} on ${pair.bg} ratio ${ratio.toFixed(2)} should be >= ${pair.min}`).toBeGreaterThanOrEqual(pair.min);
		}
	});

	test('typography_scale_is_monotonic', () => {
		const order = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
		for (let index = 1; index < order.length; index += 1) {
			const prev = DESIGN_TYPOGRAPHY_TOKENS[order[index - 1]];
			const curr = DESIGN_TYPOGRAPHY_TOKENS[order[index]];
			expect(curr).toBeGreaterThan(prev);
		}
	});

	test('motion_tokens_have_ordered_durations', () => {
		expect(DESIGN_MOTION_TOKENS.fastMs).toBeGreaterThanOrEqual(80);
		expect(DESIGN_MOTION_TOKENS.fastMs).toBeLessThan(DESIGN_MOTION_TOKENS.normalMs);
		expect(DESIGN_MOTION_TOKENS.normalMs).toBeLessThan(DESIGN_MOTION_TOKENS.slowMs);
		expect(DESIGN_MOTION_TOKENS.slowMs).toBeLessThanOrEqual(450);
	});
});
