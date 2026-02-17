export type ColorTokenName =
	| 'bg'
	| 'surface'
	| 'surfaceElevated'
	| 'surfaceMuted'
	| 'text'
	| 'textMuted'
	| 'line'
	| 'brand'
	| 'brandStrong'
	| 'brandSoft'
	| 'textOnBrand'
	| 'success'
	| 'error'
	| 'warning'
	| 'info';

export const DESIGN_COLOR_TOKENS: Record<ColorTokenName, `#${string}`> = {
	bg: '#ebf2f8',
	surface: '#ffffff',
	surfaceElevated: '#f6faff',
	surfaceMuted: '#e9f1f8',
	text: '#132336',
	textMuted: '#3d4f63',
	line: '#c8d5e2',
	brand: '#0f6b63',
	brandStrong: '#0b5a54',
	brandSoft: '#d5f3ee',
	textOnBrand: '#ffffff',
	success: '#166534',
	error: '#b42318',
	warning: '#92400e',
	info: '#1e3a8a'
};

export const DESIGN_TYPOGRAPHY_TOKENS = {
	xs: 12,
	sm: 14,
	md: 16,
	lg: 20,
	xl: 38
} as const;

export const DESIGN_MOTION_TOKENS = {
	fastMs: 120,
	normalMs: 180,
	slowMs: 280,
	easeStandard: 'cubic-bezier(0.2, 0, 0, 1)',
	easeEmphasized: 'cubic-bezier(0.16, 1, 0.3, 1)'
} as const;

export interface ContrastPair {
	fg: ColorTokenName;
	bg: ColorTokenName;
	min: number;
}

export const TEXT_CONTRAST_PAIRS: ContrastPair[] = [
	{ fg: 'text', bg: 'surface', min: 4.5 },
	{ fg: 'textMuted', bg: 'surface', min: 4.5 },
	{ fg: 'text', bg: 'surfaceElevated', min: 4.5 },
	{ fg: 'success', bg: 'surface', min: 4.5 },
	{ fg: 'error', bg: 'surface', min: 4.5 },
	{ fg: 'textOnBrand', bg: 'brand', min: 4.5 }
];

export const ACCENT_CONTRAST_PAIRS: ContrastPair[] = [
	{ fg: 'text', bg: 'brandSoft', min: 4.5 },
	{ fg: 'brandStrong', bg: 'surface', min: 4.5 },
	{ fg: 'textMuted', bg: 'surfaceMuted', min: 3.0 }
];

export function resolveToken(tokens: Record<ColorTokenName, string>, name: ColorTokenName): string {
	return tokens[name];
}

interface Srgb {
	r: number;
	g: number;
	b: number;
}

function parseHexToSrgb(hex: string): Srgb {
	const normalized = hex.trim().replace('#', '');
	if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
		throw new Error(`Expected 6-digit hex color, received "${hex}"`);
	}
	const intValue = Number.parseInt(normalized, 16);
	return {
		r: (intValue >> 16) & 0xff,
		g: (intValue >> 8) & 0xff,
		b: intValue & 0xff
	};
}

function linearize(channel: number): number {
	const value = channel / 255;
	return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
	const { r, g, b } = parseHexToSrgb(hex);
	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
	const lumA = relativeLuminance(hexA);
	const lumB = relativeLuminance(hexB);
	const lighter = Math.max(lumA, lumB);
	const darker = Math.min(lumA, lumB);
	return (lighter + 0.05) / (darker + 0.05);
}
